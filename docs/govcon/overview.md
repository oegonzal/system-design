# govcon — SAM.gov contract opportunities

`packages/govcon` finds federal contract opportunities that fit one company.
It pulls SAM.gov's Contract Opportunities feed a slice at a time inside a
daily request budget, stores every record it can normalize, and ranks what is
stored against a declarative profile — codes, phrases, prices, bands and
thresholds are data, the engine is deterministic and every point is traced.
It is one Nest context two ways: a command line, and an HTTP surface the web
client `packages/govcon-ui` operates.

## Why it is shaped this way

Every search page and every description fetch spends one SAM.gov request, and
a key has a daily quota (this key: 1,000 a day; a personal key is commonly
reported at about ten). So the tool never re-fetches what it has
(the call log doubles as a short-lived cache), refuses to call once the rolling
day's budget is spent, never retries a 429, and does all ranking offline from
Postgres. You pull once a day and search the store as often as you like.

## Commands

```
pnpm govcon pull    [--profile enfav] [--days 3 | --from YYYY-MM-DD --to YYYY-MM-DD]
pnpm govcon leads   [--profile enfav] [--min-score n] [--tier high|medium|low] [--limit 25] [--json]
pnpm govcon search  …  # pull, then leads
pnpm govcon show <noticeId> [--profile enfav] [--json]
```

`pull` prints one row per slice — `ok`, `cached` (pulled inside the window,
nothing fetched), `budget-exhausted` (the budget stopped it), `error`, or
`skipped` (a later slice after the pull stopped) — with pages, records
received, inserted, updated and rejected, then a budget line: attempts in the
last 24 hours against the budget. Exit code 2 is a usage problem, 1 a pull that
stored nothing, 0 otherwise. `--json` prints the report objects.

## The HTTP surface (`pnpm govcon:serve`, `:3004`)

The same service the CLI runs, for the web client. Every wire type is in
`@sysdesign/contracts` under `lib/govcon`; bodies are `{ data }` or
`{ data, meta }`, errors keep Nest's shape (400 with named `issues` on a bad
body or query, 404 on an unknown notice or profile).

| Route                                                 | Returns                                                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                         | `{ status: 'ok' }`                                                                                                  |
| `GET /profiles`                                       | `SearchProfile[]` — the registry as data, read-only                                                                 |
| `GET /source`                                         | `SourceStatusDto` — availability, the rolling-day budget as the ledger counts it, the cache window                  |
| `GET /source/calls?limit&offset`                      | `SourceCallDto[]` with `meta` — the ledger newest first                                                             |
| `POST /pulls` `{ profile?, days? }` or `{ from, to }` | `PullReport` — synchronous, 200: a pull is seconds and bounds itself (30 s per request, one retry, the budget)      |
| `GET /leads?profile&minScore&tier&limit`              | `LeadsReport` — ranked from the store, never a request upstream                                                     |
| `GET /opportunities/:noticeId?profile`                | `LeadDetailDto` — the lead with its trace and its description when fetched                                          |
| `POST /opportunities/:noticeId/description`           | `DescriptionResultDto` — `ok` (from the row when stored, else one budgeted request), `budget-exhausted`, or `error` |

```
curl -s localhost:3004/source | jq .data
curl -s -X POST localhost:3004/pulls -H 'content-type: application/json' -d '{"days":3}' | jq '.data.slices[]|[.outcome,.received]'
curl -s 'localhost:3004/leads?limit=5' | jq '.data.leads[]|[.score,.tier,.opportunity.title]'
curl -s -X POST localhost:3004/opportunities/<noticeId>/description | jq .data.status
```

## The web client (`packages/govcon-ui`, `pnpm govcon:start`, `:4202`)

One screen over the HTTP surface, in the shape of `quality-loop-ui`: the
source and its budget as a meter; a pull (profile, days, one button) with
its slice report; the leads over score, tier and limit filters; one lead in
full — facts, contacts, the score as a meter, every factor's points and
evidence, and the description, fetched on demand by one click that spends
one request and is then kept; the ledger newest first; the profile as data.
The open lead is remembered in the URL as `?notice=<id>`. Pure components
carry stories and specs; the workspace and the client are tested against a
stubbed API. `NEXT_PUBLIC_GOVCON_URL` names the service (default
`http://localhost:3004`).

## The profile (`packages/govcon/src/profiles/enfav.ts`)

| Field                | What it drives                                                                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `naics`, `psc`       | Code families. A shorter code is the whole family under it — a code system is hierarchical, so a six-digit NAICS matched exactly scores 1, a four-digit family 4/6.             |
| `interests`          | Declared phrases with aliases and weights, matched as whole tokens in the title. Low weight by design: titles are thin.                                                         |
| `pull.slices`        | The queries a pull runs, in priority order — one request each per page. `pageSize` (≤ 1000) and `maxPagesPerSlice` bound the spend; what remains is reported as truncated.      |
| `scoring.weights`    | One weight per factor (`naics psc interests setAside noticeType deadline`), summing to 1. A weight for a factor that does not exist, or a factor with no weight, fails at boot. |
| `scoring.setAside`   | Prices by code (`SBA: 1, SBP: 0.8`) and for unrestricted notices; a non-null code not in the map **excludes** the notice — the company cannot bid.                              |
| `scoring.noticeType` | Prices by SAM.gov's label, a default for unlisted labels, and an exclude list (an award already made is not a lead).                                                            |
| `scoring.deadline`   | Ascending bands by days left, a value beyond the last band and one for no deadline; a passed deadline or an inactive notice **excludes**.                                       |
| `scoring.tiers`      | Score thresholds for `high` and `medium`.                                                                                                                                       |

A lead's score is `100 × Σ weight × value` over the factors, one decimal; the
`show` trace lists each factor's value, weight, points and evidence, and the
points sum to the score. Gates run first: an excluded notice scores nothing
and says why.

## Environment

Loaded by Node from `.env` (`--env-file-if-exists=.env` in the `govcon`
script).

| Variable                                                  | Effect                                                                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SAM_GOV_API_KEY`                                         | The SAM.gov account's public API key. Without it the source is disabled and `pull` says so instead of failing. Read once, in the source factory; never logged. |
| `SAM_GOV_BASE_URL`                                        | The search URL; default production, `https://api-alpha.sam.gov/opportunities/v2/search` for the alpha environment (its own key).                               |
| `SAM_GOV_DESCRIPTION_URL`                                 | The notice description URL; default `https://api.sam.gov/prod/opportunities/v1/noticedesc`.                                                                    |
| `SAM_GOV_DAILY_BUDGET`                                    | Attempts allowed per rolling 24 hours, every outcome counted; default 1000 (this key's quota). Lower it for a personal key, commonly limited to about 10.      |
| `SAM_GOV_CACHE_TTL_HOURS`                                 | How long a pulled query is not pulled again; default 24, `0` disables the cache.                                                                               |
| `DB_HOST` `DB_PORT` `DB_USERNAME` `DB_PASSWORD` `DB_NAME` | Postgres for `govcon_opportunity` and `govcon_source_call`; the `govcon` script defaults `DB_PORT` to 5433 (`pnpm stack:db`).                                  |
| `GOVCON_PORT`                                             | HTTP port of `serve`, default 3004.                                                                                                                            |
| `GOVCON_CORS_ORIGIN`                                      | The browser origin allowed to call the service; default `http://localhost:4202`.                                                                               |
| `NEXT_PUBLIC_GOVCON_URL`                                  | (web client) the service's base URL; default `http://localhost:3004`.                                                                                          |

## Budget semantics

The call log records every attempt with its outcome. Before each request the
budgeted source asks the log two questions: is there a successful call for
this exact query (same filters, window and page) inside the cache window —
then the slice is `cached` and nothing is fetched; and how many attempts in
the last 24 hours — at the budget, the slice is `budget-exhausted` and the
rest of the pull is `skipped`. A rolling day is at least as strict as any
calendar-day quota with the same count. A 429 is recorded as `rate-limited`
and ends the pull. A log that cannot be read falls through to the call with a
warning: the cache is an optimisation, never a dependency. A crash between
the request and its ledger row under-counts by one; accepted.

A notice description is one more budgeted request, recorded with
`operation = 'description'` in its own key namespace so it never reads as a
fresh search; the stored row, not the ledger, is its cache — a description
already on the row answers without a request, and a pull's upsert never
touches the description columns.

## Layout

| Where                                                       | What                                                                                                                                                                                                            |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/govcon/src/core/`                                 | Pure: `ports.ts`, `query.ts` (canonical query + key), `budgeted-source.ts`, `profile.ts`, `plan.ts`, `scoring.ts`. A spec pins that nothing here reads a clock, the environment, the filesystem or the network. |
| `packages/govcon/src/modules/opportunities/sam-gov/`        | The adapter: zod `looseObject` schemas, the normalizer (three date spellings, nothing else), the source over injectable `fetch`, the env factory.                                                               |
| `packages/govcon/src/modules/opportunities/persistence/`    | Row mapper and the two MikroORM adapters.                                                                                                                                                                       |
| `packages/govcon/src/modules/opportunities/opportunities.*` | The composition root and the service (`pull`, `leads`, `show`, `describe`, `status`, `calls`).                                                                                                                  |
| `packages/govcon/src/modules/opportunities/*.controller.ts` | The HTTP surface: five thin controllers, zod schemas beside them, one `ZodValidationPipe` under `modules/app/`.                                                                                                 |
| `packages/govcon-ui/src/`                                   | The web client: `api/client.ts` (the one HTTP boundary), `features/*` (pure components with stories), `features/workspace/`.                                                                                    |
| `packages/contracts/src/lib/govcon/`                        | `Opportunity` and the documented request vocabularies.                                                                                                                                                          |
| `packages/db/src/entities/govcon-*.entity.ts`               | The two tables; migration `Migration20260926100001_create_govcon`.                                                                                                                                              |

Criteria `GOV-1..7` in `packages/criteria`; every spec title claims one.

## First run (CLI)

```
pnpm stack:db && DB_PORT=5433 pnpm db:migrate
SAM_GOV_DAILY_BUDGET=2 pnpm govcon pull --days 2      # two slices from the source, six skipped — 2 requests
SAM_GOV_DAILY_BUDGET=2 pnpm govcon pull --days 2      # both cached, 0 requests
pnpm govcon leads --min-score 40 --limit 10
pnpm govcon show <noticeId>
```

From the next day `pnpm govcon search --days 3` (eight requests with the
shipped profile) is the routine. If SAM.gov proves to match `ncode` by prefix,
six four-digit families in `pull.slices` replace the eight six-digit codes — a
data change.

## Not in v1

USAspending enrichment (an award-history port and factor), semantic
relevance through the embedding client, editable profiles in the browser,
scheduled pulls, a Playwright journey for the client (quality-loop-ui has
none either), Docker or Tilt manifests for the pair.
