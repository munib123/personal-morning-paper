// Catch-up pre-rendering: every edition without a stored PDF (or all, with force), oldest first, one at a time on
// one shared browser. Used by scripts/render-pdfs.ts; the daily job renders new editions itself.
import { createSupabaseAdminClient } from '@/server/db/admin';
import { getEdition } from '@/server/edition';
import { renderAndStoreEditionPdf } from './storage';

export interface RenderArgs {
  userId?: string;
  allMissing: boolean;
  force: boolean;
  exportDemo: boolean;
}

export const RENDER_USAGE =
  'usage: render-pdfs.ts (--user <userId> | --all-missing) [--force] [--export-demo]  (--export-demo needs --user)';

export function parseRenderArgs(argv: string[]): RenderArgs {
  const out: RenderArgs = { userId: undefined, allMissing: false, force: false, exportDemo: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--user') {
      const id = argv[++i];
      if (!id || id.startsWith('--')) throw new Error(RENDER_USAGE);
      out.userId = id;
    } else if (arg === '--all-missing') out.allMissing = true;
    else if (arg === '--force') out.force = true;
    else if (arg === '--export-demo') out.exportDemo = true;
    else throw new Error(RENDER_USAGE);
  }
  if (Boolean(out.userId) === out.allMissing) throw new Error(RENDER_USAGE);
  if (out.exportDemo && !out.userId) throw new Error(RENDER_USAGE);
  return out;
}

export interface BatchResult {
  rendered: string[];
  skipped: number;
  failed: string[];
  ms: number;
}

export async function renderMissingPdfs(opts: { userId?: string; force?: boolean }): Promise<BatchResult> {
  const started = Date.now();
  const admin = createSupabaseAdminClient();

  let query = admin.from('editions').select('user_id, edition_date, pdf_path');
  if (opts.userId) query = query.eq('user_id', opts.userId);
  if (!opts.force) query = query.is('pdf_path', null);
  const { data: rows, error } = await query.order('edition_date', { ascending: true });
  if (error) throw new Error(`[pdf] could not list editions: ${error.message}`);

  let skipped = 0;
  if (!opts.force) {
    let stored = admin.from('editions').select('id', { count: 'exact', head: true }).not('pdf_path', 'is', null);
    if (opts.userId) stored = stored.eq('user_id', opts.userId);
    skipped = (await stored).count ?? 0;
  }

  const rendered: string[] = [];
  const failed: string[] = [];
  for (const row of rows ?? []) {
    try {
      const edition = await getEdition(row.user_id, row.edition_date);
      if (!edition) throw new Error('edition not found');
      await renderAndStoreEditionPdf(edition);
      rendered.push(row.edition_date);
    } catch (err) {
      console.error('[pdf] batch render failed', { userId: row.user_id, date: row.edition_date, err });
      failed.push(row.edition_date);
    }
  }
  return { rendered, skipped, failed, ms: Date.now() - started };
}
