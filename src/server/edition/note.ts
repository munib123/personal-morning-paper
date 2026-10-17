// The editor's-note template (§9.7) and the movers sentence (Morrow voice: calm, "you", no "!"). PURE.
import type { WeightDelta } from '@/contracts/signals';

const MIN_MOVE = 0.02;

export function firstNameOf(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

/**
 * "More {A} and {B}, less {C}, based on what you read." — up to 2 risers and 1 faller that moved by at
 * least 0.02; clauses drop when empty; '' when nothing moved. Also the /me change summary.
 */
export function moversSentence(m: WeightDelta[]): string {
  const delta = (x: WeightDelta) => x.after - x.before;
  const up = m.filter((x) => delta(x) >= MIN_MOVE).sort((a, b) => delta(b) - delta(a)).slice(0, 2).map((x) => x.name);
  const down = m.filter((x) => delta(x) <= -MIN_MOVE).sort((a, b) => delta(a) - delta(b)).slice(0, 1).map((x) => x.name);
  if (up.length && down.length) return `More ${up.join(' and ')}, less ${down[0]}, based on what you read.`;
  if (up.length) return `More ${up.join(' and ')}, based on what you read.`;
  if (down.length) return `Less ${down[0]}, based on what you read.`;
  return '';
}

export function templateNote(i: { firstName: string | null; number: number; k: number; leadHeadline: string; movers: WeightDelta[] }): string {
  const greeting = i.firstName ? `Good morning, ${i.firstName}.` : 'Good morning.';
  const edition = `Edition No. ${i.number}: ${i.k} ${i.k === 1 ? 'story' : 'stories'}, led by "${i.leadHeadline}".`;
  return [greeting, edition, moversSentence(i.movers)].filter(Boolean).join(' ');
}
