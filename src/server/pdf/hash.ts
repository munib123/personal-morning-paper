import { createHash } from 'node:crypto';
import type { Edition } from '@/contracts/edition';

/** Bump when the printed design changes, so stored PDFs of the old design are re-rendered. */
export const PRINT_VERSION = 'print-v2-morrow';

/** First 12 hex of sha256 over the print version, the edition and every story's id and tier. */
export function editionPdfHash(edition: Edition): string {
  const stories = edition.items.map((i) => `${i.article.id}:${i.tier}`).join(',');
  return createHash('sha256').update([PRINT_VERSION, edition.id, edition.createdAt, stories].join('|')).digest('hex').slice(0, 12);
}

/** The Storage key inside the `papers` bucket, as saved in editions.pdf_path (no bucket prefix). */
export function pdfObjectPath(edition: Edition): string {
  return `${edition.userId}/${edition.date}-${editionPdfHash(edition)}.pdf`;
}
