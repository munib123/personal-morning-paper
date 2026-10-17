// "Tell your editor" (W2): the reader's words → a proposed diff on their interests → (on confirm) the
// edits through the same path as /me, then today's paper rebuilt.
//   tell:  profile + current weights ∥ mapTextToTopics (Gemini with keyword fallback) → proposeChanges
//   apply: fresh weights → editsFor → editInterest (PATCH /api/me/interests' function) → buildEdition(force)
// apply never calls Gemini on the request path (buildEdition defers its editor note with after()).
import type { InterestWeight } from '@/contracts/profile';
import type { TopicNode } from '@/contracts/taxonomy';
import { buildEdition, loadTaxonomy } from '@/server/edition';
import { mapTextToTopics } from '@/server/enrich';
import { editInterest, loadUserModel, toInterestWeights } from '@/server/learn';
import { getProfile } from '@/server/profile';
import { DEFAULT_PARAMS } from '@/server/rank';
import { localDate } from '@/server/time';
import { editsFor, proposeChanges, type EditorChange } from './propose';
import type { EditorEdition, TellResponse } from './schema';

export { MAX_CHANGES, editsFor, proposeChanges, setValueFor, type EditorAction, type EditorChange, type EditorProposal } from './propose';
export { EDITOR_ROUTES } from './schema';

const notOnboarded = () => Response.json({ error: 'not_onboarded' }, { status: 409 });

async function requireProfile(userId: string) {
  const profile = await getProfile(userId);
  if (!profile) throw notOnboarded();
  return profile;
}

/** Every taxonomy node with its blended θ̂ and flags: the same list the /me interest editor shows. */
async function currentInterests(userId: string, targetDate: string): Promise<{ interests: InterestWeight[]; topics: TopicNode[] }> {
  const [model, topics] = await Promise.all([loadUserModel(userId, { targetDate }), loadTaxonomy()]);
  return { interests: toInterestWeights(model, topics, DEFAULT_PARAMS), topics };
}

/** The proposal for the reader's words. A mapper failure is not an error: the reader gets an empty diff and their words back. */
export async function tellEditor(userId: string, text: string, now: Date): Promise<TellResponse> {
  const profile = await requireProfile(userId);
  const [{ interests, topics }, mapped] = await Promise.all([
    currentInterests(userId, localDate(now, profile.tz)),
    mapTextToTopics(text).catch((err: unknown) => {
      console.warn(`[editor] mapTextToTopics failed (${err instanceof Error ? err.message : String(err)})`);
      return null;
    }),
  ]);
  const picks = mapped ? { picks: mapped.picks, blocked: mapped.blocked } : { picks: [], blocked: [] };
  return { ...proposeChanges({ text, picks, interests, topics }), provider: mapped?.provider ?? 'none' };
}

/**
 * Applies the confirmed changes through editInterest (one weight_edit signal each, like /me), then
 * rebuilds today's paper. Slugs outside the taxonomy are ignored; each slug's edits run in order,
 * different slugs in parallel (a weight_edit touches only its own row).
 */
export async function applyEditorChanges(userId: string, changes: EditorChange[], now: Date): Promise<EditorEdition> {
  const profile = await requireProfile(userId);
  const { interests } = await currentInterests(userId, localDate(now, profile.tz));
  const bySlug = new Map(interests.map((w) => [w.slug, w]));
  const unique = [...new Map(changes.filter((c) => bySlug.has(c.slug)).map((c) => [c.slug, c] as const)).values()];
  await Promise.all(
    unique.map(async (c) => {
      for (const edit of editsFor(c, bySlug.get(c.slug))) await editInterest(userId, edit, now);
    }),
  );
  const edition = await buildEdition(userId, now, { force: true });
  const lead = edition.items.find((i) => i.article.id === edition.leadArticleId) ?? edition.items[0];
  return { date: edition.date, number: edition.number, leadHeadline: lead?.article.headline ?? '', changed: unique.length };
}
