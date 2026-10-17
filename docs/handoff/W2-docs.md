# W2-docs: handoff

Status: ready for merge (branch `lane/W2-docs`, based on `e4bfb24`)

Lane: the judges' first impression. Files owned: `README.md`, `docs/architecture-diagram.mmd`, `docs/architecture-diagram.svg`, `docs/architecture-diagram.png`, this file. Nothing under `src/`, `supabase/` or `package.json` was touched.

## Done

- **`README.md`** (139 lines): title and pitch, the six-step demo flow matching `docs/DEMO.md`, the architecture diagram with one sentence per component, "How the paper learns" (signals, rewards, Beta posteriors, blended θ̂, embedding EMA, refold, explore and serendipity slots, what makes it visible), "Model and algorithm efficiency", "How this was built" with numbers measured from the repository, "Run it locally" with every script and env name checked against `package.json` and `.env.example`, "Design system: Morrow", the judging-criteria map, "Limits and next steps", and the document links. Two screenshots from `docs/handoff/screens/` sit under the pitch (the PDF page 1 and the learning page).
- **`docs/architecture-diagram.mmd`**: a Mermaid flowchart of the system as it exists on `main`, derived from `docs/ARCHITECTURE.md` §4 and the code: 20 nodes in five bands (sources, worker, Supabase, app, learning loop), labelled edges, the Gemini API and the Vercel cron as dashed external nodes, learning-loop nodes tinted with the Morrow pen colour. Every label was checked against the code (`CLUSTER_THRESHOLD = 0.9`, `DEFAULT_PARAMS`, `callLLM`'s ladder and budget guard, `POOL_HOURS = 36`, the PDF route's fallback, `requestNow()`'s cookie).
- **`docs/architecture-diagram.svg`** (1,620 × 2,117 px, paper background) and **`docs/architecture-diagram.png`** (3,216 × 4,204 px, 2x), rendered with mermaid-cli 11.17.0.

## How to verify

| Check | Command or place | Expected |
|---|---|---|
| README renders | open `README.md` on GitHub (branch `lane/W2-docs`) | diagram, two screenshots and all relative links resolve |
| Every cited path exists | `ls README.md docs/architecture-diagram.{mmd,svg,png} docs/ARCHITECTURE.md docs/PLAN.md docs/DEMO.md design/project/README.md public/demo/sample.pdf` | all present |
| Every cited script exists | `node -e "const s=require('./package.json').scripts; for (const k of ['seed','embed:topics','job:ingest','job:editions','snapshot','simulate','dev','build','typecheck','lint','test']) if(!s[k]) throw k"` | no error |
| Repo numbers quoted in the README | `git log --oneline e4bfb24 \| wc -l` → 143; `gh pr list --state all --json number --limit 100` → 22 entries; `find src tests scripts -name "*.test.*" \| wc -l` → 122; `ls docs/handoff/screens \| wc -l` → 53 | as quoted |
| Diagram re-render | see the exact commands below | same files, byte-for-byte modulo mermaid's generated ids |
| Gates | `npm run typecheck && npm run lint && npm test && npm run build` | exit 0 (lint: the one pre-existing `<img>` warning in `src/components/morrow/index.tsx`) |

### Exact render commands

mermaid-cli needs a Chrome. Point it at the system Chrome from `.env.local` through a puppeteer config file (never print the env file):

```bash
# puppeteer-config.json: {"executablePath": "<PUPPETEER_EXECUTABLE_PATH from .env.local>", "args": ["--no-sandbox"]}
npx -y @mermaid-js/mermaid-cli@11 -i docs/architecture-diagram.mmd -o docs/architecture-diagram.svg -p puppeteer-config.json -b "#f5f0e6"
npx -y @mermaid-js/mermaid-cli@11 -i docs/architecture-diagram.mmd -o docs/architecture-diagram.png -s 2 -w 1624 -p puppeteer-config.json -b "#f5f0e6"
```

`-w` must be at least the SVG's viewBox width (read it with `grep -o 'viewBox="[^"]*"' docs/architecture-diagram.svg | head -1`), otherwise mermaid-cli fits the PNG into its 800 px default viewport and the 2x export comes out small. The first `npx` run installs mermaid-cli and its own puppeteer into the npx cache (several minutes on this machine); `-p` keeps it from downloading a second Chrome.

## Gates on this branch

Run from the lane worktree on top of `e4bfb24` plus the docs commits:

- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0 (1 warning, pre-existing, not in this lane's files).
- `npm test`: 120 files passed, 2 skipped (the gated model and DB integration tests), 1,030 tests passed.
- `npm run build`: exit 0 ("Compiled successfully in 39.2s") after a clean install.

Note for other lanes: `next build` fails under the node_modules **junction** the lane setup prescribes. Turbopack resolves `next/package.json` through the junction to a path outside the worktree and refuses it ("files outside of the workspace root are not compiled"). The prescribed remedy works: remove the junction (it is a reparse point; delete the link, not its target), then `PUPPETEER_SKIP_DOWNLOAD=1 ONNXRUNTIME_NODE_INSTALL=skip npm ci` (909 packages, 14 minutes on the loaded machine) and `npm run build`.

## Integration patches

None. This lane changed only its own files.

Two observations for the integrator, no patch needed from this lane:

1. `docs/DEMO.md` still describes the taste test (dropped by the Morrow spec, §3a), "Bytes" swiping and the flame streak chip. The README's demo flow follows what is built; the Loom script may want the same edit.
2. `docs/handoff/L6.md` has an empty "Done" section even though PR #33 merged the PDF route, storage cache and print fallback; the README describes the PDF from the code and PR #33.

## Missing

- A README screenshot of the web front page at desktop width that fits a README cell: `L4-front-1280.png` is a 9,775 px full-page capture, so the README uses the PDF page and the learning page instead. A 1280 × 900 viewport capture of the fold would be a better hero image.
- The README's "How this was built" numbers are as of `e4bfb24` (14:45 PKT). Refresh them at submission time with the commands in the table above.
- The FigJam export of the diagram (PLAN §8 lists FigJam/PNG; the Mermaid PNG satisfies the submission, FigJam was not attempted in this lane's time box).

## Risks

- **Stale honesty.** The "Limits and next steps" section names what was stubbed at `e4bfb24` (L3 route handlers, `processSignals`, `getLearningView`, `job:editions`, `snapshot`, the landing page). If those PRs land before submission, delete the bullet "Routes still on stubs when this was written" or it will undersell the product; `grep -rl "STUB (L0)" src scripts` is the check.
- **Numbers drift.** Commit, PR and test-file counts move with every merge; the README states the commit they were measured at.
- **SVG fonts.** The diagram asks for Libre Franklin and falls back to Helvetica/Arial on machines without it; the PNG was rendered with the fallback, so both look the same everywhere.
