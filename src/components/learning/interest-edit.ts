// "Your interests" edits: the copy that says what tomorrow will change, and the optimistic update.
import type { InterestWeight } from '@/contracts/profile';
import type { TopicSlug } from '@/contracts/taxonomy';

export type EditAction = 'pin' | 'unpin' | 'mute' | 'unmute' | 'set';

export function effectCopy(action: EditAction, name: string, value?: number, before?: number): string {
  switch (action) {
    case 'pin':
      return `Tomorrow's paper will always include ${name}.`;
    case 'unpin':
      return `Tomorrow's paper will no longer always include ${name}.`;
    case 'mute':
      return `Tomorrow's paper will leave out ${name}.`;
    case 'unmute':
      return `Tomorrow's paper will bring back ${name}.`;
    case 'set': {
      const change = value !== undefined && before !== undefined ? Math.round((value - before) * 100) : 0;
      if (change > 0) return `Tomorrow's paper will lean more on ${name}.`;
      if (change < 0) return `Tomorrow's paper will lean less on ${name}.`;
      return `Tomorrow's paper will keep ${name} where it is.`;
    }
    default: {
      const never: never = action;
      return never;
    }
  }
}

/** The weights as they will be once the edit lands (shown at once; replaced by the server's answer). */
export function applyEdit(weights: InterestWeight[], slug: TopicSlug, action: EditAction, value?: number): InterestWeight[] {
  return weights.map((w) => {
    if (w.slug !== slug) return w;
    switch (action) {
      case 'pin':
        return { ...w, pinned: true };
      case 'unpin':
        return { ...w, pinned: false };
      case 'mute':
        return { ...w, muted: true };
      case 'unmute':
        return { ...w, muted: false };
      case 'set':
        return value === undefined ? w : { ...w, theta: Math.max(0, Math.min(1, value)) };
      default:
        return w;
    }
  });
}
