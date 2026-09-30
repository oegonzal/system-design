# quality-loop

The generic critic → evaluator → controller loop as a NestJS starter. Pipelines are data (vocabularies, md lens personas, a decision policy) plus one `OutputShape`; models return enums and ordinals; the deterministic policy owns every number and the final decision; every run writes a dump.

```bash
pnpm quality-loop:run --pipeline system-design --goal packages/quality-loop/prompts/order-history.md
pnpm quality-loop:serve          # POST /runs · GET /runs/:id · POST /criteria · GET /pipelines · GET /health on :3003
pnpm exec nx test quality-loop
```

Layout: `src/core` (pure engine), `src/pipelines/<id>` (one folder per pipeline: `system-design`, `agentic-design`, `memory-recall`, `experience-digest`, and the studio's two — `system-design-canvas`, a drawn canvas judged or coached, and `design-prompt`, a prompt written from an experience), `src/dump` (the run-dump layout), `src/modules` (Nest wiring; `modules/memory` composes the three pipelines over the vector store), `prompts/` (the library `GET /prompts` serves; one markdown file per prompt, titled by its H1).

How it works, the env variables, the dump layout and the guarantees: [docs/pipeline-best-practices/quality-loop.md](../../docs/pipeline-best-practices/quality-loop.md).

Runs persist in Postgres through MikroORM (`pnpm stack:db` then `pnpm db:migrate`; the scripts default `DB_PORT` to 5433). HTTP: `GET /pipelines`, `GET /prompts`, `GET /prompts/:id`, `POST /criteria` (a pipeline's rubric for a goal, no run), `POST /runs` (202; `criteria` fixes the rubric, `output` provides the artifact), `GET /runs`, `GET /runs/:id`, `POST /memory-runs` (202, recall → target → digest → store), `POST /memory-runs/digest` (202), `GET /memory-runs`, `GET /memory-runs/:id`, `GET /health` (with the model that backs the loop). Every wire type is in `@sysdesign/contracts` under `lib/quality-loop`. The web client is `packages/quality-loop-ui` (`pnpm quality:start`).
