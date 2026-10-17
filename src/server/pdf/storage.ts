// Stored PDFs: the private `papers` bucket (made by the migration), keyed {userId}/{date}-{hash}.pdf, with the
// key saved in editions.pdf_path. Downloads get a signed URL that lasts an hour.
import type { Edition } from '@/contracts/edition';
import { createSupabaseAdminClient } from '@/server/db/admin';
import { requestNow } from '@/server/time';
import { loadPrintExtras } from './extras';
import { pdfObjectPath } from './hash';

export const PAPERS_BUCKET = 'papers';
export const SIGNED_URL_TTL_S = 3600;

type Admin = ReturnType<typeof createSupabaseAdminClient>;

let bucketReady: Promise<void> | null = null;

/** Safety net only (the migration creates the bucket): checked once per process, created private on a miss. */
export function ensurePapersBucket(admin: Admin): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const found = await admin.storage.getBucket(PAPERS_BUCKET);
      if (found.data && !found.error) return;
      const made = await admin.storage.createBucket(PAPERS_BUCKET, { public: false });
      if (made.error && !/exist/i.test(made.error.message)) throw new Error(`[pdf] bucket: ${made.error.message}`);
    })();
    bucketReady.catch(() => {
      bucketReady = null; // try again next time
    });
  }
  return bucketReady;
}

/** Tests only: forget the per-process bucket check. */
export function resetPapersBucketMemo(): void {
  bucketReady = null;
}

/** A signed URL for the edition's stored PDF, or null when none is stored (or signing fails). */
export async function getEditionPdfUrl(editionId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('editions').select('pdf_path').eq('id', editionId).maybeSingle();
  if (error || !data?.pdf_path) return null;
  const signed = await admin.storage.from(PAPERS_BUCKET).createSignedUrl(data.pdf_path, SIGNED_URL_TTL_S);
  if (signed.error || !signed.data?.signedUrl) return null;
  return signed.data.signedUrl;
}

/** Renders the edition with full Puppeteer, uploads it and records editions.pdf_path. Returns the path. */
export async function renderAndStoreEditionPdf(edition: Edition): Promise<string> {
  const admin = createSupabaseAdminClient();
  await ensurePapersBucket(admin);
  let now: Date;
  try {
    now = await requestNow();
  } catch {
    now = new Date(); // job:editions and the scripts run outside a request scope
  }
  const extras = await loadPrintExtras(edition, now);
  // Loaded on demand: the renderer (React DOM server + Puppeteer) stays out of bundles that never render.
  const { renderEditionPdf } = await import('./render');
  const { pdf } = await renderEditionPdf(edition, extras);

  const path = pdfObjectPath(edition);
  const uploaded = await admin.storage.from(PAPERS_BUCKET).upload(path, pdf, { contentType: 'application/pdf', upsert: true });
  if (uploaded.error) throw new Error(`[pdf] upload failed: ${uploaded.error.message}`);
  const saved = await admin.from('editions').update({ pdf_path: path }).eq('id', edition.id);
  if (saved.error) throw new Error(`[pdf] could not record pdf_path: ${saved.error.message}`);
  return path;
}
