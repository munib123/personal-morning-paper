// POST /api/onboarding/describe (L5, ARCHITECTURE §9.2): { text } → { picks, blocked, provider }.
// Step 3 "In your words". The only request path allowed to reach Gemini (inside L2's mapTextToTopics),
// so it is guarded three ways: an 8 s timeout, a per-address burst limit that protects the shared
// free-tier quota, and L5's keyword matcher whenever the model throws, stalls or says nothing usable.
// Whatever the source, only slugs that exist in the taxonomy are returned.
import { z } from 'zod';
import { DescribeRequestSchema } from '@/contracts/api';
import type { TopicSlug } from '@/contracts/taxonomy';
import { keywordTopics } from '@/components/onboarding/lib/keywords';
import { mapTextToTopics } from '@/server/enrich';
import { getTaxonomy } from '@/server/onboarding';

export const dynamic = 'force-dynamic';

const MODEL_TIMEOUT_MS = 8000;
const BURST_WINDOW_MS = 60_000;
const BURST_MAX = 8; // model calls per address per minute; beyond that the keyword matcher answers
const recent = new Map<string, number[]>();

// Lenient on purpose: one odd slug from the model should not throw away the good ones.
const ModelResult = z.object({
  picks: z.array(z.string()),
  blocked: z.array(z.string()),
  provider: z.enum(['gemini', 'keyword']),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = DescribeRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) return Response.json({ error: 'invalid', issues: parsed.error.issues }, { status: 400 });
  const { text } = parsed.data;

  const taxonomy = await getTaxonomy();
  const known = new Set(taxonomy.map((n) => n.slug));
  const clean = (slugs: string[]): TopicSlug[] => [...new Set(slugs)].filter((s) => known.has(s));

  if (withinBurst(clientKey(request))) {
    const model = await fromModel(text);
    if (model) {
      const picks = clean(model.picks);
      const blocked = clean(model.blocked);
      if (picks.length > 0 || blocked.length > 0) return Response.json({ picks, blocked, provider: model.provider });
    }
  }
  return Response.json({ ...keywordTopics(text, taxonomy), provider: 'keyword' });
}

async function fromModel(text: string): Promise<z.infer<typeof ModelResult> | null> {
  try {
    const parsed = ModelResult.safeParse(await withTimeout(mapTextToTopics(text), MODEL_TIMEOUT_MS));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`describe timed out after ${ms} ms`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e: unknown) => { clearTimeout(timer); reject(e); },
    );
  });
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip') || 'unknown';
}

// Rate limiting runs on the real clock (not the demo clock): it protects a real quota.
function withinBurst(key: string): boolean {
  const now = Date.now();
  if (recent.size > 5000) recent.clear();
  const hits = (recent.get(key) ?? []).filter((t) => now - t < BURST_WINDOW_MS);
  const allowed = hits.length < BURST_MAX;
  if (allowed) hits.push(now);
  recent.set(key, hits);
  return allowed;
}

// Reads JSON whatever the content type. Empty → {}, malformed → undefined (fails validation).
async function readJson(request: Request): Promise<unknown> {
  try {
    const body = await request.text();
    return body.trim() ? (JSON.parse(body) as unknown) : {};
  } catch {
    return undefined;
  }
}
