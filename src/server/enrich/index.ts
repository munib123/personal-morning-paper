// L2 enrichment (ARCHITECTURE §9.3). runEnrich runs in the worker only; writeEditorNote and
// mapTextToTopics are imported by the app, so this module's import graph stays free of model runtimes.
import type { WeightDelta } from '@/contracts/signals';

export interface EnrichStats { enriched: number; fallback: number; unusable: number; llmCalls: number; ms: number; }

export interface EditorNoteInput { paperName: string; displayName: string | null; date: string; number: number; headlines: { headline: string; section: string }[]; movers: WeightDelta[]; streak: number;
  preferSmart?: boolean; }   // true for demo personas (profile.is_demo) → SMART model; everyone else uses the FAST ladder

export { runEnrich } from './run';
export { templateNote, writeEditorNote } from './editorNote';
export { keywordTopics, mapTextToTopics } from './describe';
