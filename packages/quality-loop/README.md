# quality-loop

The generic critic → evaluator → controller loop as a NestJS service. Pipelines are data (vocabularies, md lens personas, a decision policy) plus one `OutputShape`; models return enums and ordinals; the deterministic policy owns every number and the final decision; every run writes a dump and a row.

```bash
pnpm quality-loop:run --pipeline system-design --goal packages/quality-loop/prompts/order-history.md
pnpm quality-loop:serve          # the HTTP surface on :3003 (QUALITY_LOOP_PORT)
node packages/quality-loop/dist/main.js replay --pipeline system-design   # every recorded iteration, decided again by each controller
pnpm exec nx test quality-loop
```

Layout: `src/core` (the pure engine — `contracts/`, `stages/`, `evidence/`, `loop/`, `outputs/`, `controllers/`, `testing/`; `pipeline.ts`, `policy.ts` and `ports.ts` are its interface), `src/pipelines/<id>` (one folder per pipeline: `system-design`, `agentic-design`, `memory-recall`, `experience-digest`, and the studio's two — `system-design-canvas`, a drawn canvas judged or coached, and `design-prompt`, a prompt written from an experience), `src/orchestrators/<id>` (`memory`, `router`, `calibration`, `second-opinion`, each data over registered pipelines; `runner/` sequences and records them, `panel/` and `common.ts` hold what two of them share), `src/modules` (Nest wiring: `runs`, `orchestration`, `memory`, `router`, `prompts`, with `http/` the one edge the controllers share), `src/cli` (`run`, `replay`), `src/dump` (the run-dump layout), `prompts/` (the library `GET /prompts` serves; one markdown file per prompt, titled by its H1).

How it works, the env variables, the dump layout and the guarantees: [docs/pipeline-best-practices/quality-loop.md](../../docs/pipeline-best-practices/quality-loop.md); the orchestrators: [docs/pipelines/orchestrators.md](../../docs/pipelines/orchestrators.md).

Runs persist in Postgres through MikroORM (`pnpm stack:db` then `pnpm db:migrate`, on the default port 5433); the memory store is Qdrant (`QDRANT_URL`). HTTP: `GET /health` (with the model that backs the loop and the pace its runs heartbeat at: `heartbeatEveryMs`, `staleAfterMs`), `GET /pipelines`, `POST /criteria` (a pipeline's rubric for a goal, no run), `POST /runs` (202; `criteria` fixes the rubric, `output` provides the artifact), `GET /runs`, `GET /runs/:id`, `GET /prompts`, `GET /prompts/:id`, `POST /orchestrations/:orchestrator` (202; `memory` recalls → runs the target → digests → stores, `router` classifies the brief and runs the judge it picks, `calibration` and `second-opinion` run a panel), `POST /orchestrations/:orchestrator/from-run` (202; start from a persisted run), `GET /orchestrations`, `GET /orchestrations/:id`, `POST /memory/:id/reindex` (re-embed a memory run's lessons), `POST /memory/retrieval-report` (what a recall would find for a goal), `POST /router/report` (which judge the router would pick). Every wire type is in `@sysdesign/contracts` under `lib/quality-loop`. The web client is `packages/quality-loop-ui` (`pnpm quality:start`).
