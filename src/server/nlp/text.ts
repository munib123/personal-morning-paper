// Sentence splitting and the embedding input (ARCHITECTURE §10.2: title + ". " + first 2 sentences). Pure.

// A sentence ends at . ! or ? (plus any closing quotes or brackets) followed by whitespace and an
// uppercase letter, a digit, an opening quote or an opening bracket.
const BOUNDARY = /(?<=[.!?][)\]"'”’]*)\s+(?=[A-Z0-9"“‘'([])/;
// A fragment that ends in one of these abbreviations was split too early: glue it to the next one.
const ABBREVIATION = /\b(?:Mr|Mrs|Ms|Dr|St|vs|No|U\.S)\.$/;

export function splitSentences(text: string): string[] {
  const parts = text.trim().split(BOUNDARY).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let pending = '';
  for (const part of parts) {
    pending = pending ? `${pending} ${part}` : part;
    if (!ABBREVIATION.test(pending)) {
      out.push(pending);
      pending = '';
    }
  }
  if (pending) out.push(pending);
  return out;
}

/** What gets embedded for an article: the title alone when there is no lede or content text. */
export function embeddingInput(a: { title: string; lede: string | null; contentText: string | null }): string {
  const title = a.title.trim();
  const text = a.lede?.trim() || a.contentText?.trim() || '';
  const lead = splitSentences(text).slice(0, 2).join(' ');
  return lead ? `${title}. ${lead}` : title;
}
