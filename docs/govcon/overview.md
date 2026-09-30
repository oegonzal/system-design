# govcon — find and bid on SAM.gov contract opportunities

`packages/govcon` finds federal contract opportunities that fit one company and
keeps what a bidder needs around them. It pulls SAM.gov's Contract
Opportunities feed a slice at a time inside a daily request budget, stores
every record it can normalize, ranks what is stored against a declarative
profile — codes, phrases, prices, bands and thresholds are data, the engine
is deterministic and every point is traced — and, from the same key, reads a
notice's description, the awards the government already made (SAM.gov and
USAspending), and the registrants behind them. Bids are tracked per notice.
It is one Nest context two ways: a command line, and an HTTP surface the
web client `packages/govcon-ui` operates.

## Why it is shaped this way

Every request against SAM.gov — a search page, a description, an award page,
an entity batch — spends the key's one daily quota (this key: 1,000 a day; a
personal key is commonly reported at about ten). So every upstream call goes
through one gate: a query pulled inside the cache window is answered from the
ledger and spends nothing; a spent bucket refuses instead of calling; a 429
is recorded and never retried; every HTTP attempt (a retried 5xx included)
is one ledger row; and all ranking, listing and summarizing reads Postgres.
USAspending needs no key and is ledgered but never refused. Attachments are
public links and cost nothing. You pull once a day and read the store as
often as you like.

## Commands

```
pnpm govcon pull     [--profile <id>] [--days 3 | --from YYYY-MM-DD --to YYYY-MM-DD]
pnpm govcon leads    [--profile <id>] [--min-score n] [--tier high|medium|low] [--limit 25] [--json]
pnpm govcon search   …                                     # pull, then leads
pnpm govcon show     <noticeId> [--profile <id>] [--description] [--json]
pnpm govcon awards   fetch --naics a,b [--psc c,d] --from YYYY-MM-DD --to YYYY-MM-DD [--sources sam.gov,usaspending] [--json]
pnpm govcon entities lookup <uei…> [--json]
pnpm govcon profiles list [--json]
pnpm govcon:serve                                          # the HTTP surface on :3004
```

No `--profile` means the store's default profile. `pull` prints one row per
saved search flagged for the pull — `ok`, `cached`, `budget-exhausted`,
`error`, or `skipped` with why — then the budget line. Exit code 2 is a
usage problem, an unknown profile or a window the plan cannot run; 1 a pull
that stored nothing or a notice that is not stored; 0 otherwise. `--json`
prints the report objects.

## The HTTP surface (`pnpm govcon:serve`, `:3004`)

Every wire type is in `@sysdesign/contracts` under `lib/govcon`; bodies are
`{ data }` or `{ data, meta }`; errors keep Nest's shape (400 with named
`issues` on a bad body, query or profile document; 404 on an unknown notice,
profile or search; 409 on a duplicate id or name or the last profile; 502/503
when a lookup could not be completed). No route needs `?profile=`: the
default answers.

| Route                                                                                                                                                                            | Returns                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                                                                                                                                                    | `{ status: 'ok' }`                                                                                                                                   |
| `GET/POST /profiles`, `GET/PUT/DELETE /profiles/:id`, `POST /profiles/:id/default`                                                                                               | `StoredProfile` — the document validated by the boot schema on every write                                                                           |
| `GET/POST /profiles/:id/searches`, `PUT/DELETE /searches/:id`                                                                                                                    | `SavedSearch` — a named `QueryFilter`, `days`, `includedInPull`, `pullOrder`                                                                         |
| `POST /pulls` `{ profile?, days? \| from, to }`                                                                                                                                  | `PullReport` — the flagged saved searches, in order, one slice each (200, synchronous, bounded by the budget and `GOVCON_PULL_DEADLINE_SECONDS`)     |
| `POST /searches/:id/run`, `POST /searches/run { filter, days? }`                                                                                                                 | `PullReport` with one slice — 1 request per page                                                                                                     |
| `GET /leads?profile&minScore&tier&naics&setAside&noticeType&agency&q&deadlineWithinDays&limit&offset`                                                                            | `LeadsReport` — filtered and bounded in SQL (`MAX_CANDIDATES`, `capped` says when it cut), ranked, paged; never a request                            |
| `GET /notices/:id`, `POST /notices/:id/description`                                                                                                                              | `NoticeDto` (lead + description + attachments + bid + awards); `DescriptionFetch` — 1 request once, then the row                                     |
| `PUT/DELETE /notices/:id/bid`, `GET /pipeline?stage&limit&offset`, `GET /pipeline/summary`                                                                                       | `Bid`; `PipelineRow[]` scored; counts per stage and what is due within `DUE_SOON_DAYS`                                                               |
| `GET /awards?naics&psc&agency&solicitationNumber&awardeeUei&from&to&source&limit&offset`, `GET /awards/summary?…`, `POST /awards/fetch { naics[], psc?[], from, to, sources[] }` | `Award[]`; `AwardsSummary`; `FetchAwardsReport` — SAM.gov 1 request per page for every code at once (≤ `MAX_AWARD_PAGES`), USAspending free          |
| `GET /entities/:uei`, `GET /entities/own?profile`, `POST /entities/lookup { ueis[] }`                                                                                            | `Entity` from the store; the profile's `entityUei`; `EntityLookup` — 1 request per `MAX_UEI_BATCH` UEIs, the registration carries the exclusion flag |
| `GET /source`, `GET /source/calls?operation&limit&offset`                                                                                                                        | `SourceStatus` — every source and bucket; the ledger newest first                                                                                    |

```
curl -s localhost:3004/source | jq .data.buckets
curl -s -X POST localhost:3004/pulls -H 'content-type: application/json' -d '{"days":3}' | jq '.data.slices[]|[.name,.outcome,.received]'
curl -s 'localhost:3004/leads?naics=5415&deadlineWithinDays=30&limit=5' | jq '.data.leads[]|[.score,.tier,.opportunity.title]'
curl -s -X POST localhost:3004/awards/fetch -H 'content-type: application/json' -d '{"naics":["332710"],"from":"2026-06-01","to":"2026-09-29","sources":["sam.gov","usaspending"]}' | jq .data
```

## The web client (`packages/govcon-ui`, `pnpm govcon:start`, `:4202`)

Six routes under one shell (the nav is one data table the bar, the titles
and the route announcer read; the active profile is one choice in the header
every page scores against): **Dashboard** (the buckets, a pull, what is due
this week, the ten best leads, the company's own registration), **Search**
(the store over every filter, free; SAM.gov over every `QueryFilter` field,
run and saved, each saved search togglable into the daily pull), **Pipeline**
(tracked notices by stage, the stage editable inline), **Notice** (facts,
place and contacts, the attachments as public links, the score trace, the
description on demand, the awards of its solicitation and NAICS, the bid
panel), **Intel** (fetch and summarize awards, look registrants up) and
**Settings** (profiles as editable data with the service's issues per
field; the sources and the full ledger). Every button that spends a request
says so. Pure components carry stories and specs; containers are specified
against a stubbed API. `NEXT_PUBLIC_GOVCON_URL` names the service.

## The profile

A profile is a validated document in the store (`govcon_search_profile`),
edited in Settings; the shipped Enfav profile (`packages/govcon/src/profiles/enfav.ts`)
seeds an empty store once with its eight NAICS searches flagged for the pull.

| Field                                    | What it drives                                                                                                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `naics`, `psc`                           | Code families. A shorter code is the whole family under it — a six-digit NAICS matched exactly scores 1, a four-digit family 4/6. The store's `naics` lead filter matches families the same way; SAM.gov's `ncode` is exact. |
| `interests`                              | Declared phrases with aliases and weights, matched as whole tokens in the title.                                                                                                                                             |
| `entityUei`                              | The company's SAM.gov id; `GET /entities/own` and the dashboard's registration card read it.                                                                                                                                 |
| `pull.pageSize`, `pull.maxPagesPerSlice` | Bound the spend per slice; what remains is reported as truncated. What a pull searches is the profile's saved searches flagged `includedInPull`, in `pullOrder`.                                                             |
| `leads.horizonDays`                      | A ranking reads only notices posted inside it (pushed down with the other gates).                                                                                                                                            |
| `scoring.weights`                        | One weight per factor — `naics psc interests setAside noticeType deadline history freshness` — summing to 1; the record is closed over the factor table.                                                                     |
| `scoring.setAside`                       | Prices by code and for unrestricted notices; a non-null code not in the map **excludes** (and is filtered in SQL).                                                                                                           |
| `scoring.noticeType`                     | Prices by SAM.gov's label, a default for unlisted labels, and an exclude list (filtered in SQL).                                                                                                                             |
| `scoring.deadline`, `scoring.freshness`  | Ascending day bands; a passed deadline or an inactive notice **excludes**.                                                                                                                                                   |
| `scoring.history`                        | Stored awards in the same NAICS inside `days`, `saturateAt` of them worth 1, with how many were the notice's own subtier.                                                                                                    |
| `scoring.tiers`                          | Score thresholds for `high` and `medium`.                                                                                                                                                                                    |

A lead's score is `100 × Σ weight × value`, one decimal; the trace lists each
factor's value, weight, points and evidence, and the points sum to the score.

## Environment

Loaded by Node from `.env` (`--env-file-if-exists=.env`).

| Variable                                                                                    | Effect                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SAM_GOV_API_KEY`                                                                           | The SAM.gov account's public key. Without it the SAM.gov sources are disabled and say so. Read once, in `modules/sources/sam-gov/create-sources.ts`; appended to requests in `modules/sources/http.ts` and redacted from every message; never logged. |
| `SAM_GOV_BASE_URL`, `SAM_GOV_DESCRIPTION_URL`, `SAM_GOV_AWARDS_URL`, `SAM_GOV_ENTITIES_URL` | The four SAM.gov endpoints; default production.                                                                                                                                                                                                       |
| `USASPENDING_BASE_URL`                                                                      | Default `https://api.usaspending.gov`; no key.                                                                                                                                                                                                        |
| `SAM_GOV_DAILY_BUDGET`                                                                      | Attempts per rolling 24 hours against SAM.gov, every API and outcome counted; default 1000.                                                                                                                                                           |
| `SAM_GOV_CACHE_TTL_HOURS`                                                                   | How long a pulled search is not pulled again; default 24, `0` disables.                                                                                                                                                                               |
| `GOVCON_PULL_DEADLINE_SECONDS`                                                              | A pull starts no new slice after this long; default 120.                                                                                                                                                                                              |
| `DB_HOST` `DB_PORT` `DB_USERNAME` `DB_PASSWORD` `DB_NAME`                                   | Postgres; the defaults are the compose server `pnpm stack:db` starts (port 5433).                                                                                                                                                                     |
| `GOVCON_PORT`, `GOVCON_CORS_ORIGIN`                                                         | The HTTP port (3004) and the browser origin allowed (`http://localhost:4202`).                                                                                                                                                                        |
| `NEXT_PUBLIC_GOVCON_URL`                                                                    | (web client) the service's base URL; default `http://localhost:3004`.                                                                                                                                                                                 |

## Budget semantics

`RequestGate.spend` in `core/budget/gate.ts` is the one door. Before a call
it asks the ledger two questions: for a cacheable operation (searches), is
there a successful row for this exact key inside the cache window — then
`cached`, nothing fetched; and how many attempts against this source's
bucket in the last 24 hours — at the budget, `budget-exhausted`, nothing
called. Then the adapter runs and reports every HTTP attempt it made, and
each becomes one row (`attempt` 1, 2) under the same key. The retry policy
is data: 5xx and dropped connections once after a bounded pause, a timeout
and a 429 never. A rolling day is at least as strict as any calendar-day
quota with the same count. A ledger that cannot be read falls through to the
call with a warning: the cache is an optimisation, never a dependency.

Buckets are by source id: every SAM.gov operation spends `sam.gov`;
`usaspending` has no bucket. A description's cache is its row, a fetched
award or registrant is upserted by its source's own id, an attachment is a
public link the client opens directly.

Two provider facts found by probing and worth remembering: SAM.gov's awards
search takes up to a hundred codes per request and counts pages in its
`offset` parameter; Entity Management's registration section carries the
exclusion flag, so the Exclusions API is never spent.

## Layout

| Where                                                                              | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/govcon/src/core/`                                                        | Pure: `budget/` (attempt, policy, gate), `ports/` (search, description, awards, entities, bids, profiles, searches, ledger, repositories), `plan.ts` (`resolveWindow`, `planPulls`), `pull.ts` (`runPull` with its deadline), `candidates.ts` (the SQL push-down), `scoring.ts` (`FACTORS`), `intel.ts` (`summarizeAwards`, the history index), `pipeline.ts`, `profile.ts` (the schema). A spec pins that nothing here reads a clock, the environment, the filesystem or the network. |
| `packages/govcon/src/modules/sources/`                                             | `http.ts` (attempts, retries, redaction), `sam-gov/` (search, descriptions, awards, entities over one transport; schemas, normalizers, fixtures from live responses; the env factory), `usaspending/`, the ledger, `GET /source`.                                                                                                                                                                                                                                                      |
| `packages/govcon/src/modules/{profiles,pulls,opportunities,bids,awards,entities}/` | One concern each: services, thin controllers with zod schemas beside them, MikroORM adapters under `persistence/`.                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/govcon/src/modules/app/`                                                 | The composition root, `configure-app.ts` over `@sysdesign/nest-kit`, the HTTP suite.                                                                                                                                                                                                                                                                                                                                                                                                   |
| `packages/govcon/src/{cli,render}.ts`                                              | `parseOptions` → `execute(options, service, io)`; the renderers.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/govcon-ui/src/`                                                          | `app/` (routes, `nav.ts`, `route-link.ts`), `components/` (the shell), `providers/` (the profile choice), `api/client.ts`, `features/<page>/`.                                                                                                                                                                                                                                                                                                                                         |
| `packages/contracts/src/lib/govcon/`                                               | The vocabularies, bounds, records, request/response shapes, the shared formatting and the fixture builders.                                                                                                                                                                                                                                                                                                                                                                            |
| `packages/db/src/entities/govcon-*.entity.ts`                                      | Seven tables: opportunity, source call, search profile, saved search, bid, award, entity.                                                                                                                                                                                                                                                                                                                                                                                              |

Criteria `GOV-1..19` and `GOVU-1..10` in `packages/criteria`; every spec
title claims one.

## First run

```
pnpm stack:db && pnpm db:migrate
pnpm govcon profiles list             # the seeded profile, once
pnpm govcon search --days 3           # 8 requests with the shipped searches, then the ranking
pnpm govcon show <noticeId> --description
pnpm govcon awards fetch --naics 332710,541511 --from 2026-06-01 --to 2026-09-29   # 1 request per page + USAspending
pnpm govcon:start                     # the service and the client
```
