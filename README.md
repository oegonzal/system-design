# System Design Studio

Practice distributed-systems design the way you'd whiteboard it in an
interview — on an interactive canvas, against prompts grounded in real
production experience, with a critic/eval pipeline that grades every
submission and teaches you why.

**The loop:** pick an experience → generate a design prompt (concrete scale
targets, functional requirements, NFRs) → sketch the architecture from a
palette of system-design building blocks (gateway, load balancer, service,
database, replica, cache, queue, event stream, CDN, …) → submit → a
background worker grades the design across seven dimensions (reliability,
scalability, performance, data, messaging, security, hygiene) → findings
point at the exact nodes and edges, several with one-click suggested fixes →
accept, iterate, resubmit, watch the score climb. A STAR-story repository
sits alongside for the behavioral half of the interview.

## Tech stack

- **TypeScript** end to end · **Nx** monorepo on **pnpm** workspaces
- **Next.js** (App Router) + **React Flow** canvas + **Emotion** design system + **Storybook**
- **NestJS** API and a dedicated **eval worker** process
- **PostgreSQL** + **MikroORM** (hand-written migrations, `migration:check` drift gate)
- **Tilt** + Docker Desktop **Kubernetes** dev environment
- **Vitest** + **Playwright** · GitHub Actions CI with an LLM + rules code-review pipeline

## Getting started

Prerequisites: [nvm](https://github.com/nvm-sh/nvm), Docker Desktop with
Kubernetes enabled, [Tilt](https://docs.tilt.dev/install.html).

```bash
bash scripts/setup.sh   # verifies the toolchain, installs dependencies
tilt up                 # postgres → migrations → seed → api → worker → web
```

| Service     | Where                                                |
| ----------- | ---------------------------------------------------- |
| Frontend    | http://localhost:4200                                |
| API         | http://localhost:3000/api                            |
| Eval worker | http://localhost:3002/health                         |
| Postgres    | localhost:5432 · `admin`/`admin` · db `sysdesign`    |
| Storybook   | `nx run storybook:storybook` → http://localhost:6006 |

Set `ANTHROPIC_API_KEY` to enable the LLM half of the pipeline (prompt-prose
enrichment and the design critic). Without it — or with
`EVAL_DETERMINISTIC=1` — everything still works: the deterministic rules
engine grades alone and output is byte-reproducible.

## Workspace layout

Packages carry a `project.json` (no per-package `package.json`); every
dependency is hoisted to the root and Nx is the single entry point.

| Package                  | What it is                                                                 |
| ------------------------ | -------------------------------------------------------------------------- |
| `packages/contracts`     | Wire types + `as const` vocabularies every layer derives from              |
| `packages/db`            | MikroORM entities, migrations, seed — shared by API and worker             |
| `packages/llm`           | The one LLM seam: Claude via structured outputs, no-op without a key       |
| `packages/design-system` | Emotion tokens → semantic roles → 14 primitives, contrast-asserted         |
| `packages/studio-api`    | NestJS REST API: prompts, sessions, revisions, evaluations, stories        |
| `packages/eval-worker`   | Postgres-queue poller + rules engine + LLM critic                          |
| `packages/studio-ui`     | Next.js app: canvas workspace, feedback loop, STAR repository              |
| `packages/storybook`     | Catalog host globbing sibling stories                                      |
| `packages/studio-e2e`    | Playwright: requirement specs + the full practice-loop journey             |
| `packages/criteria`      | Completion criteria registry; tests claim ids like `[EVAL-1]` in titles    |
| `tooling/`               | Code-review pipeline (LLM critics + deterministic rules) + Storybook smoke |

## How grading works

Submitting a revision creates the immutable snapshot, a queued evaluation and
a job row in one transaction. The worker claims jobs with
`UPDATE … (SELECT … FOR UPDATE SKIP LOCKED) RETURNING` — any number of
replicas can share the table — runs the pure rules engine (19 rules, each
finding a short lesson with the offending node ids and often a
machine-applicable patch), asks the critic for insights the rules can't see,
and persists scores + findings. Rules alone decide the grade; critic findings
annotate. A stale-lock reaper turns worker crashes into delays, and failures
retry with exponential backoff before landing in a `failed` state the UI can
retry.

## Everyday commands

```bash
pnpm exec nx run-many -t lint typecheck test build --all   # the full local gate
pnpm db:migrate && pnpm db:seed                            # schema + reference data
pnpm db:migrate:check                                      # entities vs migrations drift
pnpm exec nx run studio-e2e:e2e                            # end-to-end (servers auto-start)
pnpm review:code --staged --profile=quick                  # what the pre-commit hook runs
pnpm test:stories                                          # render every story, both modes
```

Git hooks live in `.githooks` (activated by `pnpm install` via the `prepare`
script): format staged files, lint/typecheck affected projects, then a quick
review pass. `SKIP_REVIEW=1 git commit` skips the review; `--no-verify`
skips everything.
