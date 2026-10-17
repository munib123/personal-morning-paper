// W2-shipkit: small pure helpers shared by the snapshot script and the runtime reader.

/**
 * JSON.stringify with every object's keys sorted (recursively) and 2-space indentation, so two runs of
 * the snapshot script over the same data produce the same bytes. Arrays keep their order; undefined
 * values behave as in JSON.stringify (dropped from objects, null inside arrays).
 */
export function stableStringify(value: unknown, indent = 2): string {
  return JSON.stringify(sortKeys(value), null, indent);
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : sortKeys(v)));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortKeys(v);
    }
    return out;
  }
  return value;
}

/**
 * The pre-rendered persona PDF for an edition date among the files of public/demo, as a site path
 * ('/demo/<file>'), or null. `<date>.pdf` wins; otherwise the first .pdf whose name contains the date.
 * The generic sample.pdf never matches, so a paper without its own PDF still takes the print route.
 */
export function pickLocalPdf(date: string, files: string[]): string | null {
  const pdfs = files.filter((f) => f.toLowerCase().endsWith('.pdf'));
  const exact = pdfs.find((f) => f === `${date}.pdf`);
  const hit = exact ?? pdfs.filter((f) => f.includes(date)).sort()[0];
  return hit ? `/demo/${hit}` : null;
}
