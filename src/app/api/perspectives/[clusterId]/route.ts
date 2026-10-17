// GET /api/perspectives/{clusterId} (W2 "Other angles"): the stored perspectives for a cluster plus
// its sources. When nothing is stored the answer is the deterministic fallback built from the sources'
// own words: Gemini is never on the request path (ARCHITECTURE §11). Cluster data is public-read, so
// no session is needed; the answer is still private-cached for five minutes.
import { fallbackPerspectives, sourcesOf, type PerspectivesResponse, type StoredPerspectives } from '@/server/perspectives/build';
import { getClusterSources } from '@/server/perspectives';
import { requestNow } from '@/server/time';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CACHE_CONTROL = 'private, max-age=300';

export async function GET(_request: Request, { params }: { params: Promise<{ clusterId: string }> }): Promise<Response> {
  const { clusterId } = await params;
  if (!UUID.test(clusterId)) return Response.json({ error: 'invalid cluster id' }, { status: 400 });

  let found: Awaited<ReturnType<typeof getClusterSources>>;
  try {
    found = await getClusterSources(clusterId);
  } catch (err) {
    console.error('[perspectives] read failed', err);
    return Response.json({ error: 'perspectives unavailable' }, { status: 503 });
  }
  if (!found) return Response.json({ error: 'not found' }, { status: 404 });

  const { cluster, articles, stored } = found;
  const perspectives: StoredPerspectives =
    stored ?? { ...fallbackPerspectives(cluster, articles), provider: 'fallback', model: null, computedAt: (await requestNow()).toISOString() };
  const body: PerspectivesResponse = { perspectives, sources: sourcesOf(articles) };
  return Response.json(body, { headers: { 'Cache-Control': CACHE_CONTROL } });
}
