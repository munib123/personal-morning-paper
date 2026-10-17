// Gated: loads the real local model (downloads ~34 MB into MODEL_CACHE_DIR on the first run).
//   RUN_MODEL_TESTS=1 MODEL_CACHE_DIR=<dir> npx vitest run src/server/nlp/embed.test.ts
import { describe, expect, it } from 'vitest';
import { embeddingModelId } from './embed';
import { embedTexts } from './index';
import { cosine } from './vector';

const norm = (v: Float32Array) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));

describe.skipIf(!process.env.RUN_MODEL_TESTS)('embedTexts with the local model', () => {
  it('returns 384-d unit vectors from Supabase/gte-small and puts related texts closer', async () => {
    const vectors = await embedTexts(['cricket match', 'PSX index rises']);
    expect(vectors).toHaveLength(2);
    for (const v of vectors) {
      expect(v).toBeInstanceOf(Float32Array);
      expect(v).toHaveLength(384);
      expect(Math.abs(norm(v) - 1)).toBeLessThan(1e-3);
    }
    expect(embeddingModelId()).toBe('local:Supabase/gte-small');

    const [win, century, rates] = await embedTexts(['Pakistan wins the cricket match', 'Babar Azam scores a century', 'Interest rates rise']);
    expect(cosine(win, century)).toBeGreaterThan(cosine(win, rates));
  }, 300_000);
});
