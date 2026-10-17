// ARCHITECTURE §9.1 (binding). Lanes import these, never redefine them.
import type { TopicSlug } from './taxonomy';
import type { StreakView } from './streak';

export const SIGNAL_TYPES = ['impression','open','dwell','read_original','skip','more','less','save','share',
  'pdf_download','qr_scan','recall_answer','audio_play','taste_more','taste_less','taste_skip','hide_source','weight_edit'] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];
export interface SignalEvent { type: SignalType; articleId?: string; editionId?: string; value?: number; meta?: Record<string, string | number | boolean>; }
export interface WeightDelta { slug: TopicSlug; name: string; before: number; after: number; }
export interface EventsResult { accepted: number; streak: StreakView; deltas: WeightDelta[]; toast: string | null; }
