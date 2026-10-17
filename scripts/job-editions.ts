// npm run job:editions → buildEdition (force=false, editor note awaited) for every onboarded profile,
// then renderAndStoreEditionPdf (§12). Writes one job_runs row with job='editions' (§9.7).
import './lib/env';

import { runEditionsJob } from '@/server/edition/job';

runEditionsJob(new Date(), { job: 'editions' })
  .then((stats) => {
    console.log(JSON.stringify(stats));
    process.exit(stats.failed.length > 0 ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
