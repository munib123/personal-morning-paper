// Renders the fixture edition to public/demo/sample.pdf (the committed demo PDF) and one PNG per page into
// docs/handoff/screens. Run from the repo root:
//   npx tsx --tsconfig src/server/pdf/tsconfig.tsx.json --env-file=.env.local scripts/render-sample-pdf.ts
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE_EDITION } from '@/contracts/fixtures';
import { closeBrowser } from '@/server/pdf/browser';
import { fixtureExtras } from '@/server/pdf/fixture';
import { renderEditionPdf } from '@/server/pdf/render';

async function main(): Promise<void> {
  const out = path.join(process.cwd(), 'public', 'demo', 'sample.pdf');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const result = await renderEditionPdf(FIXTURE_EDITION, fixtureExtras(), { screenshotsDir: path.join('docs', 'handoff', 'screens') });
  fs.writeFileSync(out, result.pdf);

  const raw = Buffer.from(result.pdf).toString('latin1');
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const links = (raw.match(/\/URI\s*\(/g) ?? []).length;
  console.log(
    `pages=${pages} expected=${result.pages} links=${links} overflow=${JSON.stringify(result.overflow)} ` +
      `attempts=${result.attempts} ms=${result.ms} bytes=${result.pdf.byteLength}`,
  );
}

main()
  .then(() => closeBrowser())
  .then(
    () => process.exit(0),
    async (err) => {
      console.error('[pdf] sample render failed', err);
      await closeBrowser();
      process.exit(1);
    },
  );
