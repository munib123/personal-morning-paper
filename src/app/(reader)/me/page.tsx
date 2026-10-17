// STUB (L0) — owner: L7. Replace freely; keep the route.
import type { Metadata } from 'next';
import { SectionHeader } from '@/components/morrow';

export const metadata: Metadata = { title: 'Your paper' };

// The three /me tabs (ARCHITECTURE §3). Real version (L7): working tabs over /api/me/learning, interests and streak.
const TABS = [
  {
    id: 'learned',
    title: 'Your paper learned',
    body: 'Interest bars with their changes, what moved and why, the signal timeline and the 7-day fast-forward chart.',
  },
  {
    id: 'interests',
    title: 'Interests',
    body: 'The topic tree from onboarding as an editor: pin, mute and adjust each interest.',
  },
  {
    id: 'streak',
    title: 'Streak & settings',
    body: 'Your reading streak and heatmap, paper length, depth, city and theme.',
  },
] as const;

export default function MePage() {
  return (
    <div className="mx-auto flex w-full max-w-(--page-max) flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex max-w-(--measure) flex-col gap-2">
        <h1 className="headline-lg">Your paper</h1>
        <p className="ui-text text-ink-soft">What your paper has learned, and how to change it.</p>
      </header>
      {TABS.map((tab) => (
        <section key={tab.id} className="flex max-w-(--measure) flex-col">
          <SectionHeader id={tab.id} title={tab.title} />
          <p className="ui-text text-ink-soft">{tab.body}</p>
        </section>
      ))}
      <p className="ui-meta text-ink-muted">Stub page · owner L7</p>
    </div>
  );
}
