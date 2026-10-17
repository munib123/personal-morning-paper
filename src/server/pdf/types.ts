// L6 print types. Contracts (Edition, WeightDelta, …) come from @/contracts and are never redefined here.
import type { WeightDelta } from '@/contracts/signals';

/** What the paper needs beyond the edition itself. No streak: the PDF carries no gamification. */
export interface PrintExtras {
  city: string;
  displayName: string | null;
  movers: WeightDelta[];
  appUrl: string;
}
