// GET /api/taste?picks=a,b,c (L5, ARCHITECTURE §9.2) → TasteCard[]: 8 cards, 6 matched + 2 wildcards.
// No session needed (it runs before sign-up). Whatever the query or the database does, it answers 200
// with 8 cards, so the onboarding preview never breaks.
import { FIXTURE_TASTE_CARDS } from '@/contracts/fixtures';
import type { TasteCard } from '@/contracts/profile';
import { getTasteCards } from '@/server/onboarding';
import { parsePicks } from '@/server/onboarding/taste';

export const dynamic = 'force-dynamic';

export async function GET(request: Request): Promise<Response> {
  const picks = parsePicks(new URL(request.url).searchParams.get('picks'));
  let cards: TasteCard[];
  try {
    cards = await getTasteCards(picks);
  } catch {
    cards = FIXTURE_TASTE_CARDS;
  }
  return Response.json(cards, { headers: { 'Cache-Control': 'private, max-age=300' } });
}
