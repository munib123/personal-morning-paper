// "Tell your editor" (W2) request and response bodies, shared by the routes and the client card.
// PURE (zod only). The routes are outside the §9.2 list, so their paths live here, not in ROUTES.
import { z } from 'zod';
import { TopicSlugSchema } from '@/contracts/api';
import { MAX_CHANGES, type EditorChange } from './propose';

export const MAX_TEXT = 500;

export const EDITOR_ROUTES = { tell: '/api/editor/tell', apply: '/api/editor/apply' } as const;

export const EditorChangeSchema: z.ZodType<EditorChange> = z.object({
  slug: TopicSlugSchema,
  name: z.string().min(1).max(120),
  before: z.number().min(0).max(1),
  after: z.number().min(0).max(1),
  action: z.enum(['raise', 'lower', 'pin', 'mute', 'add']),
  reason: z.string().max(300),
});

export const TellRequestSchema = z.object({ text: z.string().trim().min(1).max(MAX_TEXT) });

export const TellResponseSchema = z.object({
  changes: z.array(EditorChangeSchema).max(MAX_CHANGES),
  unmatched: z.array(z.string()),
  provider: z.enum(['gemini', 'keyword', 'none']), // who read the words: Gemini, the keyword matcher, or nobody (the mapper failed)
});

export const ApplyRequestSchema = z.object({ changes: z.array(EditorChangeSchema).min(1).max(MAX_CHANGES) });

export const EditorEditionSchema = z.object({
  date: z.string(),
  number: z.number().int(),
  leadHeadline: z.string(),
  changed: z.number().int().min(0),
});

export const ApplyResponseSchema = z.object({ edition: EditorEditionSchema });

export type TellResponse = z.infer<typeof TellResponseSchema>;
export type EditorEdition = z.infer<typeof EditorEditionSchema>;
export type ApplyResponse = z.infer<typeof ApplyResponseSchema>;
