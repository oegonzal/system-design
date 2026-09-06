# quality-loop

The generic critic → evaluator → controller loop as a NestJS starter. Pipelines are data (vocabularies, md lens personas, a decision policy) plus one `OutputShape`; models return enums and ordinals; the deterministic policy owns every number and the final decision; every run writes a dump.

```bash
pnpm quality-loop:run --pipeline system-design --goal packages/quality-loop/samples/order-history.prompt.md
pnpm quality-loop:serve          # POST /runs · GET /runs/:id · GET /pipelines · GET /health on :3003
pnpm exec nx test quality-loop
```

Layout: `src/core` (pure engine), `src/pipelines/<id>` (one folder per pipeline), `src/dump` (the run-dump layout), `src/modules` (Nest wiring), `samples/` (a prompt to try).

How it works, the env variables, the dump layout and the guarantees: [docs/pipeline-best-practices/quality-loop.md](../../docs/pipeline-best-practices/quality-loop.md).
