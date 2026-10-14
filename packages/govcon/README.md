# govcon

SAM.gov contract opportunities for one company, as a NestJS service with a command line and an HTTP surface: pull the profile's saved searches inside a daily request budget, store what normalizes in Postgres, rank the store against a declarative profile, keep bids per notice, read the awards and registrants the same key reaches, and research where and when the government spends, how much of it was open to the profile and which primes pass work down, through USAspending lenses over one scope, snapshotted for the cache window, refreshed daily for the default profile with the alerts it finds put to a person through the notifications bus.

```bash
pnpm govcon search --days 3                 # pull, then rank — the daily routine (8 requests with the shipped searches)
pnpm govcon leads --min-score 40            # rank what is stored; no request is ever made
pnpm govcon show <noticeId> --description   # one notice with its trace; the text costs one request once
pnpm govcon awards fetch --naics 332710 --from 2026-06-01 --to 2026-09-29
pnpm govcon entities lookup <uei>
pnpm govcon:serve                           # the HTTP surface on :3004 for packages/govcon-ui
pnpm exec nx test govcon                    # the pure suites in parallel, the Postgres suites in one lane
```

Layout: `src/core` (pure — the budget gate, the ports, the profile schema, the pull plan and run, the candidate filter, scoring, award intel, the spending lenses with their snapshot read-through, projection and horizon walk), `src/modules/sources` (SAM.gov and USAspending adapters over one attempt-reporting transport, the ledger), `src/modules/{profiles,pulls,opportunities,bids,awards,entities,spending,views}` (one concern each), `src/profiles/enfav.ts` (the seed), `src/cli.ts` + `src/render.ts`.

How it works, every route, the environment and the budget semantics: [docs/govcon/overview.md](../../docs/govcon/overview.md); the spending lenses, the warm and the alerts: [docs/govcon/spending.md](../../docs/govcon/spending.md). Tables live in `packages/db`; `pnpm stack:db` then `pnpm db:migrate` before the first pull. Every wire type is in `@sysdesign/contracts` under `lib/govcon`.
