// GET /api/editions/[date]/pdf (ARCHITECTURE §9.2): 302 to the stored PDF's signed URL; on a miss, render and
// store it where full Puppeteer runs (local, Actions); otherwise 503 { fallback: '/paper/{date}/print' }.
import { PdfFallbackSchema, ROUTES } from '@/contracts/api';
import { requireUser } from '@/server/auth/session';
import { getEdition } from '@/server/edition';
import { getEditionPdfUrl, renderAndStoreEditionPdf } from '@/server/pdf';
import { isPaperDate } from '@/server/pdf/access';
import { canRenderHere } from '@/server/pdf/browser';
import { isDemoFallback } from '@/server/demo';

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const printFallback = (date: string) => Response.json(PdfFallbackSchema.parse({ fallback: ROUTES.print(date) }), { status: 503 });

export async function GET(request: Request, { params }: { params: Promise<{ date: string }> }): Promise<Response> {
  const { date } = await params;
  if (!isPaperDate(date)) return Response.json({ error: 'bad_date' }, { status: 400 });

  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (err) {
    if (err instanceof Response) return err;
    throw err;
  }

  const edition = await getEdition(userId, date);
  if (!edition) return Response.json({ error: 'no_edition' }, { status: 404 });
  if (isDemoFallback()) return edition.pdfUrl ? Response.redirect(new URL(edition.pdfUrl, request.url), 302) : printFallback(date);

  const stored = await getEditionPdfUrl(edition.id).catch(() => null);
  if (stored) return Response.redirect(stored, 302);
  if (!canRenderHere()) return printFallback(date); // Vercel: no browser, the print route prints it

  try {
    await renderAndStoreEditionPdf(edition);
    const fresh = await getEditionPdfUrl(edition.id);
    if (fresh) return Response.redirect(fresh, 302);
    throw new Error('stored PDF could not be signed');
  } catch (err) {
    console.error('[pdf] render failed', { date, userId, err });
    return printFallback(date);
  }
}
