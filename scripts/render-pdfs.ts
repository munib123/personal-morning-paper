// Pre-renders stored PDFs (the catch-up path; the daily job renders new editions itself). Run from the repo root:
//   npx tsx --tsconfig src/server/pdf/tsconfig.tsx.json --env-file=.env.local scripts/render-pdfs.ts \
//     (--user <userId> | --all-missing) [--force] [--export-demo]
// --export-demo writes the reader's earliest and latest stored PDFs to public/demo/persona-{first,today}.pdf.
// NEXT_PUBLIC_APP_URL is baked into the QR codes and links, so set it to the deployed URL first.
import fs from 'node:fs';
import path from 'node:path';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { parseRenderArgs, renderMissingPdfs } from '@/server/pdf/batch';
import { closeBrowser } from '@/server/pdf/browser';
import { PAPERS_BUCKET } from '@/server/pdf/storage';

async function exportDemoPair(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('editions')
    .select('edition_date, pdf_path')
    .eq('user_id', userId)
    .not('pdf_path', 'is', null)
    .order('edition_date', { ascending: true });
  if (error || !data?.length) throw new Error(`[pdf] no stored PDFs to export for ${userId}`);
  const pair = [
    ['persona-first.pdf', data[0]],
    ['persona-today.pdf', data[data.length - 1]],
  ] as const;
  for (const [file, row] of pair) {
    const { data: blob, error: downloadError } = await admin.storage.from(PAPERS_BUCKET).download(row.pdf_path!);
    if (downloadError || !blob) throw new Error(`[pdf] could not download ${row.pdf_path}: ${downloadError?.message}`);
    const out = path.join(process.cwd(), 'public', 'demo', file);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(await blob.arrayBuffer()));
    console.log(`exported ${row.edition_date} -> public/demo/${file} (${blob.size} bytes)`);
  }
}

async function main(): Promise<number> {
  const args = parseRenderArgs(process.argv.slice(2));
  const result = await renderMissingPdfs({ userId: args.userId, force: args.force });
  if (args.exportDemo && args.userId) await exportDemoPair(args.userId);
  console.log(`rendered=${result.rendered.length} skipped=${result.skipped} failed=${JSON.stringify(result.failed)} ms=${result.ms}`);
  return result.failed.length > 0 ? 1 : 0;
}

main().then(
  async (code) => {
    await closeBrowser();
    process.exit(code);
  },
  async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await closeBrowser();
    process.exit(1);
  },
);
