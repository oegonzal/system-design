# System Design Studio

Practice distributed-systems design the way you'd whiteboard it in an
interview — on an interactive canvas, against prompts grounded in real
production experience, with a critic/evaluator/controller loop that grades
every submission, explains why, and can coach the design forward.

**The loop:** pick a prompt — write one as markdown, import one from the
library, or generate one from a seeded experience — the grader derives its
criteria once (`c1…cN`) → sketch the architecture from a palette of
system-design building blocks (gateway, load balancer, service, database,
replica, cache, queue, event stream, CDN, …) → bind each criterion to the
components that hold it, trace the path a request takes, narrate the design →
submit → the quality loop judges it with five critics and two evaluators and a
deterministic controller → findings point at the exact nodes and edges, results
sit beside each criterion → iterate, resubmit, or hand the draft to the coach
and watch its better iterations land in the timeline. A STAR-story repository
sits alongside for the behavioral half of the interview.

## Tech stack

- **TypeScript** end to end · **Nx** monorepo on **pnpm** workspaces
- **Next.js** (App Router) + **React Flow** canvas + **Emotion** design system + **Storybook**
- **NestJS** API and the **quality loop** service — a generic critic/evaluator/controller loop whose pipelines are data
- **PostgreSQL** + **MikroORM** (hand-written migrations, `migration:check` drift gate) · **Qdrant** for the loop's memory
- **Tilt** + Docker Desktop **Kubernetes** dev environment
- **Vitest** + **Playwright** · GitHub Actions CI with an LLM + rules code-review pipeline

## Getting started

Prerequisites: [nvm](https://github.com/nvm-sh/nvm), Docker Desktop with
Kubernetes enabled, [Tilt](https://docs.tilt.dev/install.html).

```bash
bash scripts/setup.sh   # verifies the toolchain, installs dependencies
tilt up                 # postgres → migrations → seed → api → quality loop → web
```

| Service         | Where                                                |
| --------------- | ---------------------------------------------------- |
| Frontend        | http://localhost:4200                                |
| Quality loop UI | http://localhost:4201                                |
| Govcon UI       | http://localhost:4202                                |
| API             | http://localhost:3000/api                            |
| Quality loop    | http://localhost:3003/health                         |
| Postgres        | localhost:5432 · `admin`/`admin` · db `sysdesign`    |
| Storybook       | `nx run storybook:storybook` → http://localhost:6006 |

Grading needs a model, and the quality loop runs only on a Claude Code
subscription login: this machine's `claude login`, or, where there is no login
(a Tilt/Kubernetes pod), the `CLAUDE_CODE_OAUTH_TOKEN` that `claude setup-token`
prints, kept in the repo's gitignored `.env` or exported in the shell. `serve`
and `run` ask Claude Code whether it is signed in before anything boots (no
model call) and exit 1 saying how to get a login when it is not; there is no
switch that runs the loop without a model, so a run never looks graded when
none ran. An API key in the environment is never used. No test calls a model:
the loop's specs script a fake client, and the studio's specs and the e2e stub
share one fake loop (`packages/studio-testing`).

### Without Kubernetes — durable local stack

If you're not running Tilt/k8s, `pnpm stack:up` brings the whole stack up
against a **durable** Postgres (a `docker-compose` service on port **5433**
with a named volume, so your practice runs survive a shutdown or reboot and
come back on the next `pnpm stack:up`):

```bash
pnpm stack:up     # durable db + vector store → migrate → seed → api + quality loop + ui
pnpm stack:down   # stop db + vector store (data persists in the named volumes)
```

The compose stack also starts Qdrant (the quality loop's memory store, service
`vectors`, `localhost:6333`) — compose only, not under Tilt.

Past runs re-appear on the Dashboard, since every session, design and grading
run is a Postgres row. See **[RUNBOOK.md](./RUNBOOK.md)** for the persistence
model and how to bring your runs back in the future.

## Workspace layout

Packages carry a `project.json` (no per-package `package.json`); every
dependency is hoisted to the root and Nx is the single entry point.

| Package                    | What it is                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/contracts`       | Wire types, `as const` vocabularies and the zod schemas every layer derives from                  |
| `packages/db`              | MikroORM entities, migrations, seed — shared by the API and the quality loop                      |
| `packages/llm`             | The one LLM seam: Claude via structured outputs on a key or the subscription route; none, no boot |
| `packages/nest-kit`        | Shared Nest plumbing: zod pipe, MikroORM root module, health, CORS, list paging, LIKE escaping    |
| `packages/design-system`   | Emotion tokens → semantic roles → primitives, contrast-asserted                                   |
| `packages/studio-api`      | NestJS REST API: prompts, sessions, revisions, stories; grading and coaching through the loop     |
| `packages/run-dump`        | Run-folder plumbing every pipeline dumps through (`static/runs`)                                  |
| `packages/quality-loop`    | Generic critic/evaluator/controller loop: pipelines as data, HTTP + CLI — grades the studio       |
| `packages/quality-loop-ui` | Next.js client for the quality loop: pick a prompt, run, watch, read the verdict                  |
| `packages/govcon`          | SAM.gov contract opportunities: budgeted pull, Postgres store, deterministic leads (CLI + HTTP)   |
| `packages/govcon-ui`       | Next.js client for govcon: pull, rank, read a lead's trace and description, watch the ledger      |
| `packages/web-kit`         | Shared web plumbing: Emotion SSR registry, HTTP request core, polling hook                        |
| `packages/web-testing`     | Shared web spec harness: themed render, fetch stub, jsdom shims                                   |
| `packages/studio-testing`  | The quality loop as a scriptable fake, behind studio-api's client fake and the e2e stub           |
| `packages/studio-ui`       | Next.js app: canvas workspace, brief and narrative, feedback, coach, STAR repository              |
| `packages/storybook`       | Catalog host globbing sibling stories                                                             |
| `packages/studio-e2e`      | Playwright: requirement specs + the full practice-loop journey, against a stub quality loop       |
| `packages/criteria`        | Completion criteria registry; tests claim ids like `[EVAL-1]` in titles                           |
| `tooling/`                 | Code-review pipeline (LLM critics + deterministic rules) + Storybook smoke + repo gates           |

## How grading works

The studio holds no rubric of its own. A prompt is one markdown document plus
the criteria the quality loop derived from it once (`POST /criteria`) — stable
ids for the prompt's life, so a brief written against `c3` still means `c3`
on the next revision; a generated prompt's rubric is its draft's own rows.
Submitting a revision checks structure only (every reference must resolve:
edges to nodes, bindings to criteria, paths that connect), waits for no
earlier grade of the session to still be in flight, and starts one
`system-design-canvas` run on those criteria with the canvas, brief and
narrative as the artifact; the revision row points at that run's iteration.
Five critic personas (requirements, architecture, capacity, explanation,
failure scenarios) and two evaluators judge it with two samples each; the
deterministic controller prices what they agreed on into coverage, quality
attributes and compliance, and decides. The studio reads the run back,
grounds each finding onto the canvas by label and part, keeps the
controller's reason, and caches the terminal score. The coach is the same
run with more iterations, started from the draft or from a graded revision
whose recorded grade the loop adopts as iteration 1; every iteration that
beat the ones before it is imported once as an assistant revision, and
every coaching run is recorded on its session. Prompt generation is the
loop's `design-prompt` pipeline over a rendered experience. Every run
persists in `quality_run*`, heartbeats while it runs, and writes a full
dump under `static/runs/`.

## Everyday commands

```bash
pnpm exec nx run-many -t lint typecheck test build --all   # the full local gate
pnpm db:migrate && pnpm db:seed                            # schema + reference data
pnpm db:migrate:check                                      # entities vs migrations drift
pnpm exec nx run studio-e2e:e2e                            # end-to-end (servers and the stub auto-start)
pnpm review:code --staged --profile=quick                  # what the pre-commit hook runs
pnpm test:stories                                          # render every story, both modes
pnpm quality-loop:run --pipeline system-design --goal packages/quality-loop/prompts/order-history.md
pnpm quality:start                         # quality-loop on :3003 + its web client on :4201 (needs the db)
pnpm govcon:start                          # govcon on :3004 + its web client on :4202 (needs the db)
```

The dev servers need no Nx daemon: `nx run studio-api:serve` and
`quality-loop:serve` are two plain processes, `vite build --watch` writing
`dist/main.js` and `node --watch` restarting on it; `next dev` builds into
`.next-dev`, so a `next build` never clobbers a running dev server.

Git hooks live in `.githooks` (activated by `pnpm install` via the `prepare`
script): format staged files, lint/typecheck affected projects, then a quick
review pass. `SKIP_REVIEW=1 git commit` skips the review; `--no-verify`
skips everything. The review's critics run on the same Claude Code
subscription login as the quality loop — this machine's `claude login`
locally, and in CI the `CLAUDE_CODE_OAUTH_TOKEN` repository secret that
`claude setup-token` prints (without it, or on a fork PR, the deterministic
rules run alone). No API key is read. Every setting the review takes is
declared in `tooling/code-review/config.ts`.
