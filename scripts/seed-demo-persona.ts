// npx tsx scripts/seed-demo-persona.ts
// Seeds the demo persona (DEMO_USER_EMAIL): 7 days of real history on the real candidate pool, then
// today's paper (No. 8). Idempotent: re-running resets and rewrites her rows; the auth user is kept.
import './lib/env';

import { seedDemoPersona } from '@/server/learn/sim/seed';

async function main() {
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
    console.error('seed-demo-persona: set DEMO_USER_EMAIL and DEMO_USER_PASSWORD (in .env.local)');
    process.exit(1);
  }
  const summary = await seedDemoPersona(new Date(), { email, password });
  for (const w of summary.warnings) console.warn(`warning: ${w}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
