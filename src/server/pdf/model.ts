// Turns an edition into the static PrintModel: layout plus inlined QR codes and pictures.
import type { Edition } from '@/contracts/edition';
import { inlineImage } from './images';
import { buildPrintLayout, storyHref } from './layout';
import { qrSvg } from './qr';
import type { PrintExtras, PrintLayout, PrintModel } from './types';

/**
 * QR codes for the lead, rail and inner stories (briefs print a link instead), pictures for the lead and the
 * inner section leads only. Everything is fetched in parallel; a failed asset is simply left out.
 */
export async function preparePrintModel(edition: Edition, extras: PrintExtras, layout: PrintLayout = buildPrintLayout(edition)): Promise<PrintModel> {
  const qrItems = [layout.lead, ...layout.rail, ...layout.inner.flatMap((p) => p.items)];
  const pictured = [layout.lead, ...layout.inner.map((p) => p.items[0])];

  const [qrs, images] = await Promise.all([
    Promise.all(
      qrItems.map(async (item) => {
        try {
          return [item.article.id, await qrSvg(storyHref(extras.appUrl, item.article.id, edition.id))] as const;
        } catch (err) {
          console.warn('[pdf] qr skipped', { articleId: item.article.id, err });
          return null;
        }
      }),
    ),
    Promise.all(pictured.map(async (item) => [item.article.id, await inlineImage(item.article.imageUrl)] as const)),
  ]);

  return {
    edition,
    layout,
    extras,
    assets: {
      qr: Object.fromEntries(qrs.filter((q): q is readonly [string, string] => q !== null)),
      images: Object.fromEntries(images),
    },
  };
}
