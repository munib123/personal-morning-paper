// /api/cron/editions (L3, §9.2): GET (Vercel cron, 0 0 * * * UTC) and POST, both behind
// `Authorization: Bearer ${CRON_SECRET}` → job stats; its job_runs row is 'editions-cron' (§9.7).
import { route } from '@/server/edition/http';
import { runEditionsJob } from '@/server/edition/job';
import { requestNow } from '@/server/time';

export const maxDuration = 60;

function authorized(request: Request | undefined): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request?.headers.get('authorization') === `Bearer ${secret}`;
}

const handler = route(async (request: Request) => {
  if (!authorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  return Response.json(await runEditionsJob(await requestNow(), { job: 'editions-cron' }));
});

export const GET = handler;
export const POST = handler;
