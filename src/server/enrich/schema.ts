// The Gemini batch schema (ARCHITECTURE §10.3). Deliberately lenient (flat, every field required, no
// length constraints: research 13 §1.4) so one bad article never sinks its batch; the deterministic
// guardrails (guardrails.ts) are the strict part.
import { z } from 'zod';

export const enrichmentItemSchema = z.object({
  id: z.string(),
  usable: z.boolean(),
  headline: z.string(),
  summary_brief: z.string(),
  summary_std: z.string(),
  summary_deep: z.string(),
  why_it_matters: z.string(),
  key_fact: z.string(),
  topic_slugs: z.array(z.string()),
  entities: z.array(z.string()),
  recall: z.object({
    question: z.string(),
    options: z.array(z.string()),
    answer_index: z.number(),
    explanation: z.string(),
  }),
});

export const batchSchema = z.object({ items: z.array(enrichmentItemSchema) });

export type EnrichmentItem = z.infer<typeof enrichmentItemSchema>;
export type EnrichmentBatch = z.infer<typeof batchSchema>;
