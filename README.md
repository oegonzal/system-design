# System Design Studio

Practice software system design the way you'd whiteboard it in a senior
engineering interview — on an interactive canvas, against prompts grounded in
real production experience, with a critic/evaluator/controller loop that
grades every submission as the competencies a panel looks for, explains why,
and can coach the design forward.

**The loop:** pick a prompt — write one as markdown, import one from the
library, or generate one from a seeded experience — the grader derives its
criteria once (`c1…cN`) → sketch the architecture from a palette of
building blocks from the application's own actors and modules down to its
infrastructure (gateway, load balancer, service, database, replica, cache,
queue, event stream, CDN, …) → bind each criterion to the
components that hold it, model the entities it keeps and who owns them, trace
the path a request takes, say why that mechanism and not another, narrate the
design and record the decisions it rests on — the choice, the alternative, the
cost →
submit → the quality loop judges it with five critics and four evaluators and a
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
- **Astro** + **Tailwind CSS** for the Enfav LLC marketing site — every page prerendered, no client JavaScript, served by **Cloudflare Workers** static assets
- **Vitest** + **Playwright** · GitHub Actions CI with an LLM + rules code-review pipeline, and production deploys of the Enfav site from `main` (`.github/workflows/deploy-website.yml`)

## Getting started

Prerequisites: [nvm](https://github.com/nvm-sh/nvm), Docker Desktop with
Kubernetes enabled, [Tilt](https://docs.tilt.dev/install.html).

```bash
bash scripts/setup.sh   # verifies the toolchain, installs dependencies
tilt up                 # stores → migrations → seed → api, quality loop, govcon, notifications → web apps
```

| Service         | Where                                                |
| --------------- | ---------------------------------------------------- |
| Frontend        | http://localhost:4200                                |
| Quality loop UI | http://localhost:4201                                |
| Govcon UI       | http://localhost:4202                                |
| API             | http://localhost:3000/api                            |
| Quality loop    | http://localhost:3003/health                         |
| Govcon          | http://localhost:3004/health                         |
| Notifications   | http://localhost:3005/health                         |
| Job application | http://localhost:3006/health                         |
| Agentic system  | http://localhost:3007/health                         |
| Gmail           | http://localhost:3008/health                         |
| Google Calendar | http://localhost:3009/health                         |
| Postgres        | localhost:5433 · `admin`/`admin` · db `sysdesign`    |
| Qdrant          | http://localhost:6333                                |
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

### Without Kubernetes — the same stack as local processes

If you're not running Tilt/k8s, `pnpm stack:up` runs the studio — API,
quality loop and UI — as processes on this machine, on the same ports;
`pnpm govcon:start` and `pnpm quality-loop-ui:serve` add the rest. Both
launchers use one **durable** Postgres and Qdrant (the quality loop's memory
store): the `docker-compose` services on ports **5433** and **6333**, with
named volumes, so your practice runs survive a shutdown or reboot and either
launcher shows the same ones. `tilt up` starts them through `pnpm stack:db`
and `tilt down` leaves them running.

```bash
pnpm stack:up     # durable db + vector store → migrate → seed → api + quality loop + ui
pnpm stack:down   # stop db + vector store (data persists in the named volumes)
```

Past runs re-appear on the Dashboard, since every session, design and grading
run is a Postgres row. See **[RUNBOOK.md](./RUNBOOK.md)** for the persistence
model and how to bring your runs back in the future.

## Workspace layout

Packages carry a `project.json` (no per-package `package.json`); every
dependency is hoisted to the root and Nx is the single entry point.

| Package                         | What it is                                                                                                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/contracts`            | Wire types, `as const` vocabularies and the zod schemas every layer derives from                                                                                                                                          |
| `packages/db`                   | MikroORM entities, migrations, seed — shared by the API and the quality loop                                                                                                                                              |
| `packages/config-kit`           | A program's configuration chosen by name: `config/engine.json` names one file per kind under `config/<kind>/`, read against its owner's schema                                                                            |
| `packages/llm`                  | The one LLM seam: Claude Code on the subscription login (none, no boot), plus the embeddings port                                                                                                                         |
| `packages/nest-kit`             | Shared Nest plumbing: zod pipe, MikroORM root module, health, CORS, list paging, LIKE escaping                                                                                                                            |
| `packages/design-system`        | Emotion tokens → semantic roles → primitives, contrast-asserted                                                                                                                                                           |
| `packages/studio-api`           | NestJS REST API: prompts, sessions, revisions, stories; grading and coaching through the loop                                                                                                                             |
| `packages/run-dump`             | Run-folder plumbing every pipeline dumps through (`static/runs`)                                                                                                                                                          |
| `packages/quality-loop`         | Generic critic/evaluator/controller loop: pipelines as data, HTTP + CLI — grades the studio                                                                                                                               |
| `packages/quality-loop-ui`      | Next.js client for the quality loop: pick a prompt, run, watch, read the verdict                                                                                                                                          |
| `packages/govcon`               | SAM.gov contract opportunities: budgeted pull, Postgres store, deterministic leads (CLI + HTTP)                                                                                                                           |
| `packages/govcon-ui`            | Next.js client for govcon: pull, rank, read a lead's trace and description, watch the ledger                                                                                                                              |
| `packages/website`              | The Enfav LLC marketing site: Astro + Tailwind, every page prerendered; every company detail is a declared fact                                                                                                           |
| `packages/notifications`        | The event bus over HTTP — declared topics, pulled subscriptions — and the channels (Telegram) that put prompts to you and bring answers back                                                                              |
| `packages/job-application`      | The record of units a browser session applied to, fed by the session's events, and the advisor it asks what is on record before each plan                                                                                 |
| `packages/web-kit`              | Shared web plumbing: Emotion SSR registry, HTTP request core, hooks, route table and announcer                                                                                                                            |
| `packages/web-testing`          | Shared web spec harness: themed render, fetch stub, jsdom shims                                                                                                                                                           |
| `packages/studio-testing`       | The quality loop as a scriptable fake, behind studio-api's client fake and the e2e stub                                                                                                                                   |
| `packages/loop-client`          | The quality loop as one shared port: HTTP adapter, transport-agnostic errors, honest run awaiting                                                                                                                         |
| `packages/browser-session`      | Playwright session driven by a markdown goal; every click, answer and stop is a quality-loop run                                                                                                                          |
| `packages/notifications-client` | The notifications bus as one port: its HTTP adapter, and asking a person through it and waiting for the answer as an event                                                                                                |
| `packages/tool-session`         | A mission run as tool calls the loop decides, for any program that declares tools: the catalog, the session loop and its rails, the operator's prompts, `/sessions` and `/tools`                                          |
| `packages/google-kit`           | Acting as you on a Google API: the OAuth consent, the token file, access tokens refreshed from it, the authorized request                                                                                                 |
| `packages/gmail`                | Your mailbox as ten tools — search, read, draft, label, never send — and missions over them; new mail told on the bus and on its own bot                                                                                  |
| `packages/google-calendar`      | Your calendar as nine tools — list, search, read, suggest a time deterministically, and create, change, answer or remove an event with your approval — and missions over them; changes told on the bus and on its own bot |
| `packages/memory-ingest`        | Your documents chunked and handed to the loop, which digests them into facts in the memory store                                                                                                                          |
| `packages/studio-ui`            | Next.js app: canvas workspace, brief and narrative, feedback, coach, STAR repository                                                                                                                                      |
| `packages/storybook`            | Catalog host globbing sibling stories                                                                                                                                                                                     |
| `packages/studio-e2e`           | Playwright: requirement specs + the full practice-loop journey, against a stub quality loop                                                                                                                               |
| `packages/website-e2e`          | Playwright + axe: every built page of the Enfav site, served by wrangler dev as Cloudflare serves it (or production)                                                                                                      |
| `packages/criteria`             | Completion criteria registry; tests claim ids like `[EVAL-1]` in titles                                                                                                                                                   |
| `tooling/`                      | Code-review pipeline (LLM critics + deterministic rules) + Storybook smoke + repo gates                                                                                                                                   |

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
Five critic personas (requirements, model, structure, fitness, explanation)
and four evaluators (coverage, design, qualities, reasoning) judge it with two
samples each; the deterministic controller prices what they agreed on into
coverage, design, qualities, reasoning and compliance, and decides. Every
rubric closes with two standing trade-off criteria, so reasoning is earnable
on every prompt; scale is one criterion kind among ten and earns only what a
prompt's own figures give it. The studio reads the run back,
grounds each finding onto the canvas by label and part, keeps the
controller's reason, and caches the terminal score. The coach is the same
run with more iterations, started from the draft or from a graded revision
whose recorded grade the loop adopts as iteration 1; before it revises, the
loop recalls lessons from earlier runs for the prompt and hands them to the
coach alone (never to a grade's judges), and the panel lists them. Every
iteration that beat the ones before it is imported once as an assistant
revision, and every coaching run is recorded on its session. Prompt generation is the
loop's `design-prompt` pipeline over a rendered experience. Every run
persists in `quality_run*`, heartbeats while it runs, and writes a full
dump under `static/runs/`.

## Everyday commands

```bash
pnpm exec nx run-many -t lint typecheck test build --all   # the full local gate
pnpm db:migrate && pnpm db:seed                            # schema + reference data
pnpm db:migrate:check                                      # entities vs migrations drift
pnpm exec nx run studio-e2e:e2e                            # end-to-end in Chrome: chromium, narrow, grader-down (its own API :3200, UI :4300 and stub :3103 auto-start — a DB_NAME lane gets ports of its own; the dev stack can stay up)
pnpm exec nx run website-e2e:e2e                           # the Enfav site in Chrome, desktop and 320 px wide, against wrangler dev on :4205 (WEBSITE_E2E_BASE_URL=https://enfav.com checks production instead)
pnpm review:code --staged --profile=quick                  # what the pre-commit hook runs
pnpm test:stories                                          # render every story, both modes
pnpm quality-loop:run --pipeline system-design --goal packages/quality-loop/prompts/system/order-history.md
pnpm quality:start                         # quality-loop on :3003 + its web client on :4201 (needs the db)
pnpm govcon:start                          # govcon on :3004 + its web client on :4202 (needs the db)
pnpm notifications:serve                   # the event bus on :3005, polling one Telegram bot per purpose (needs the db)
pnpm job-application:serve                 # the record of applications on :3006, fed by the bus; the advisor a browser session asks (needs the db)
pnpm agentic-system:serve                  # memory strategies coached on the loop, and the memory spaces that execute them, on :3007 (needs the db; Qdrant for recall by meaning)
pnpm website:serve                         # the Enfav LLC marketing site on :4203
pnpm website:preview                       # the built site under wrangler dev on :4204: Cloudflare's routing, 404 page and headers
pnpm website:deploy                        # build, then deploy to enfav.com with wrangler (read docs/enfav/website.md first)
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
