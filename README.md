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

Grading needs a model. The quality loop runs on `ANTHROPIC_API_KEY`, or —
with `QUALITY_LOOP_AUTH=claude-code`, the local stack's default — through
this machine's Claude Code login. With `QUALITY_LOOP_DETERMINISTIC=1` (what
CI sets) no model is ever called: the loop's specs use fakes, the studio's
specs a fake client, the e2e suite a stub server, and a live run escalates
honestly with no score.

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

| Package                    | What it is                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `packages/contracts`       | Wire types, `as const` vocabularies and the zod schemas every layer derives from                |
| `packages/db`              | MikroORM entities, migrations, seed — shared by the API and the quality loop                    |
| `packages/llm`             | The one LLM seam: Claude via structured outputs, the subscription route, no-op without either   |
| `packages/nest-kit`        | Shared Nest plumbing: the zod validation pipe, the MikroORM root module, health, CORS           |
| `packages/design-system`   | Emotion tokens → semantic roles → primitives, contrast-asserted                                 |
| `packages/studio-api`      | NestJS REST API: prompts, sessions, revisions, stories; grading and coaching through the loop   |
| `packages/run-dump`        | Run-folder plumbing every pipeline dumps through (`static/runs`)                                |
| `packages/quality-loop`    | Generic critic/evaluator/controller loop: pipelines as data, HTTP + CLI — grades the studio     |
| `packages/quality-loop-ui` | Next.js client for the quality loop: pick a prompt, run, watch, read the verdict                |
| `packages/govcon`          | SAM.gov contract opportunities: budgeted pull, Postgres store, deterministic leads (CLI + HTTP) |
| `packages/govcon-ui`       | Next.js client for govcon: pull, rank, read a lead's trace and description, watch the ledger    |
| `packages/web-kit`         | Shared web plumbing: Emotion SSR registry, HTTP request core, polling hook                      |
| `packages/web-testing`     | Shared web spec harness: themed render, fetch stub, jsdom shims                                 |
| `packages/studio-ui`       | Next.js app: canvas workspace, brief and narrative, feedback, coach, STAR repository            |
| `packages/storybook`       | Catalog host globbing sibling stories                                                           |
| `packages/studio-e2e`      | Playwright: requirement specs + the full practice-loop journey, against a stub quality loop     |
| `packages/criteria`        | Completion criteria registry; tests claim ids like `[EVAL-1]` in titles                         |
| `tooling/`                 | Code-review pipeline (LLM critics + deterministic rules) + Storybook smoke + repo gates         |

## How grading works

The studio holds no rubric of its own. A prompt is one markdown document plus
the criteria the quality loop derived from it once (`POST /criteria`) — stable
ids for the prompt's life, so a brief written against `c3` still means `c3`
on the next revision. Submitting a revision checks structure only (every
reference must resolve: edges to nodes, bindings to criteria, paths that
connect) and starts one `system-design-canvas` run on those criteria with
the canvas, brief and narrative as the artifact; the revision row points at
that run's iteration. Five critic personas (requirements, architecture,
capacity, explanation, failure scenarios) and two evaluators judge it with
two samples each; the deterministic controller prices what they agreed on
into coverage, quality attributes and compliance, and decides. The studio
reads the run back, grounds each finding onto the author's node and edge
ids by position, and caches the terminal score. The coach is the same run
with more iterations: every iteration that beat the ones before it is
imported once as an assistant revision. Prompt generation is the loop's
`design-prompt` pipeline over a rendered experience. Every run persists in
`quality_run*` and writes a full dump under `static/runs/`.

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

Git hooks live in `.githooks` (activated by `pnpm install` via the `prepare`
script): format staged files, lint/typecheck affected projects, then a quick
review pass. `SKIP_REVIEW=1 git commit` skips the review; `--no-verify`
skips everything.
