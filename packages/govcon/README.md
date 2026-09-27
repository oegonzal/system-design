# govcon

SAM.gov contract opportunities for one company, from the command line: pull the profile's slices inside a daily request budget, store them in Postgres, rank what is stored against a declarative profile, and print the leads. No HTTP surface.

```bash
pnpm govcon search --days 3          # pull, then rank — the daily routine (8 requests with the shipped profile)
pnpm govcon pull --days 3            # pull only; a slice pulled inside the cache window costs nothing
pnpm govcon leads --min-score 40     # rank what is stored; no request is ever made
pnpm govcon show <noticeId>          # one notice with its factor trace
pnpm exec nx test govcon             # DB_PORT=5433 for the Postgres specs
```

Layout: `src/core` (pure — ports, the budgeted source, the profile schema, the pull plan, scoring), `src/profiles` (one file per company; `enfav.ts` ships), `src/modules/opportunities` (Nest wiring, the SAM.gov adapter, the MikroORM adapters), `src/cli.ts` + `src/render.ts` (the command line).

How it works, the environment variables, the budget semantics and the live sequence: [docs/govcon/overview.md](../../docs/govcon/overview.md). Tables live in `packages/db` (`govcon_opportunity`, `govcon_source_call`); `pnpm stack:db` then `DB_PORT=5433 pnpm db:migrate` before the first pull.
