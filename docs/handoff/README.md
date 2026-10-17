# Lane handoff notes

Each lane keeps one file here: `docs/handoff/L<n>.md` (L0 to L7). Only the lane that owns the file writes it, so these files never conflict in a merge. There is no shared `HANDOFF.md`.

## Sections

Start the file with one status line, such as `Status: in progress`, `Status: ready for merge` or `Status: merged at Checkpoint B`. Then write these five sections, in this order:

1. **Done.** What works now, with commit or PR links. Say what runs on real data and what still runs on fixtures.
2. **Stubbed.** What still returns fixtures or neutral values, and which other lanes' stubs your code relies on.
3. **Env needed.** Every env var your code reads, plus any outside setup (Supabase dashboard, GitHub secrets, Vercel). Give names only: values live in `.env.local` and never go into git.
4. **Verify commands.** Commands to copy and paste, each with its expected output. For example, `npx vitest run src/server/rank` should print `N passed`.
5. **Contract requests.** Any change you need to `src/contracts/*`, the DB schema or another lane's module (ARCHITECTURE §9). Never redefine a contract locally. The integrator lands the change on `main` as a `chore(contract): …` commit.

If your plan asks for more sections, such as Runs, Known issues or Notes for other lanes, add them after these five.

## Screens

UI lanes put their real-browser evidence in `docs/handoff/screens/`. Name each file `L<n>-<view>-<width>.png`, with widths of 390 and 1280 px. Add `-dark` for the Night theme, for example `L4-front-1280.png`, `L5-step1-390.png` or `L4-front-dark-390.png`. Link the screenshots from your handoff file.

## End-to-end specs

- Specs live in `e2e/` and are named `e2e/L<n>-<what>.spec.ts`. `playwright.config.ts` belongs to L0, so lanes only add specs.
- Run your specs against your lane's dev server:
  `PLAYWRIGHT_BASE_URL=http://localhost:3005 npx playwright test e2e/L5-*.spec.ts`
- Without `PLAYWRIGHT_BASE_URL`, the config starts `npm run dev` on port 3000, or reuses a server already running there.
- When `PUPPETEER_EXECUTABLE_PATH` is set (see `.env.example`), the specs drive the system Chrome, so Playwright doesn't need to download a browser.
- e2e specs don't run in CI.

## Dev-server ports (PLAN §4)

| Lane | Port |
|---|---|
| L3 | 3003 |
| L4 | 3004 |
| L5 | 3005 |
| L6 | 3006 |
| L7 | 3007 |
| integration | 3000 |
