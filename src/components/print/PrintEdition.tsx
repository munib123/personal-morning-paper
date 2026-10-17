// The printed paper as static markup: page 1, one page per inner section, the last page. It serves the
// Puppeteer page.pdf() render (with Morrow CSS and fonts inlined) and the /paper/[date]/print route.
import type { PrintModel } from '@/server/pdf/types';
import { FrontPage } from './FrontPage';
import { LastPage } from './LastPage';
import { PRINT_CSS } from './print-css';
import { SectionPage } from './SectionPage';

export function PrintEdition({ model }: { model: PrintModel }) {
  return (
    <div className="print-root">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
      <FrontPage model={model} />
      {model.layout.inner.map((page, k) => (
        <SectionPage key={page.root} model={model} page={page} number={k + 2} />
      ))}
      <LastPage model={model} />
    </div>
  );
}
