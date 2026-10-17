// Loads .env.local into process.env for tsx scripts (Next.js loads it on its own for the app).
// Import it first in every script: `import './lib/env';`. Variables already set in the
// environment win, and a missing file is fine (CI and GitHub Actions pass env directly).
try {
  process.loadEnvFile('.env.local');
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
    console.warn(`.env.local not loaded: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export {};
