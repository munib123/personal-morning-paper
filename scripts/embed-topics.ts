// npm run embed:topics → embeds "{name}: {description}" for every topic into topics.embedding (§8).
// Re-run it whenever the embedding model or EMBEDDINGS_PROVIDER changes: topics and articles must share one space.
import './lib/env';

import { embeddingModelId, embedTopics } from '@/server/nlp/embed';

async function main(): Promise<number> {
  const n = await embedTopics();
  console.log(`embedded ${n} topics via ${embeddingModelId()}`);
  return n > 0 ? 0 : 1;
}

// Exit explicitly: the model runtime must not keep the process alive.
main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
