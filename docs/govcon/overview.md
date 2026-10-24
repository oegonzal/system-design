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
web client `packages/govcon-ui` operates. The API notes it started from — a
first request against SAM.gov and USAspending, and the shape it was meant to
grow into — are archived in
[../archived/samgov-api-notes.md](../archived/samgov-api-notes.md).

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
often as you like; the spending lenses over USAspending are free and
snapshotted, and a daily warm refreshes them for the default profile and
puts what changed to a person as a digest.

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

| Route                                                                                                                                                                            | Returns                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /health`                                                                                                                                                                    | `{ status: 'ok' }`                                                                                                                                                                                                                                                                               |
| `GET/POST /profiles`, `GET/PUT/DELETE /profiles/:id`, `POST /profiles/:id/default`                                                                                               | `StoredProfile` — the document validated by the boot schema on every write                                                                                                                                                                                                                       |
| `GET/POST /profiles/:id/searches`, `PUT/DELETE /searches/:id`                                                                                                                    | `SavedSearch` — a named `QueryFilter`, `days`, `includedInPull`, `pullOrder`, when it last ran, and `lastYield`: what its last read of the source brought in — records, how many new, and how the profile ranked what it carried                                                                 |
| `POST /pulls` `{ profile?, days? \| from, to }`                                                                                                                                  | `PullReport` — the flagged saved searches, in order, one slice each (200, synchronous, bounded by the budget and `GOVCON_PULL_DEADLINE_SECONDS`); `serve` also runs it every `GOVCON_PULL_HOURS`                                                                                                 |
| `POST /searches/:id/run`, `POST /searches/run { filter, days? }`                                                                                                                 | `PullReport` with one slice — 1 request per page                                                                                                                                                                                                                                                 |
| `GET /leads?profile&minScore&tier&naics&setAside&noticeTypes&agency&q&deadlineWithinDays&limit&offset`                                                                           | `LeadsReport` — filtered and bounded in SQL (`MAX_CANDIDATES`, `capped` says when it cut), ranked, paged; never a request. `noticeTypes` is any of the types named, comma-joined or repeated                                                                                                     |
| `GET /notices/:id`, `POST /notices/:id/description`                                                                                                                              | `NoticeDto` (lead + description + attachments + bid + awards); `DescriptionFetch` — 1 request once, then the row                                                                                                                                                                                 |
| `PUT/DELETE /notices/:id/bid`, `GET /pipeline?stage&limit&offset`, `GET /pipeline/summary`                                                                                       | `Bid`; `PipelineRow[]` scored; counts per stage and what is due within `DUE_SOON_DAYS`                                                                                                                                                                                                           |
| `GET/PUT/DELETE /targets/:kind/:subject`, `GET /targets?kind&stage&limit&offset`, `GET /targets/summary`                                                                         | `Target` — a firm by its UEI or an award by its id, one row each, null when it is not tracked; the list newest change first; counts per kind and stage and what is due by its reminder                                                                                                           |
| `GET /alerts?limit&offset`                                                                                                                                                       | `RaisedAlertView[]` — what the daily warm and the daily pull raised, the newest run first and each run in its digest's order, as the alert that was published                                                                                                                                    |
| `GET /awards?naics&psc&agency&solicitationNumber&awardeeUei&from&to&source&limit&offset`, `GET /awards/summary?…`, `POST /awards/fetch { naics[], psc?[], from, to, sources[] }` | `Award[]`; `AwardsSummary`; `FetchAwardsReport` — SAM.gov 1 request per page for every code at once (≤ `MAX_AWARD_PAGES`), USAspending free                                                                                                                                                      |
| `GET /entities/:uei`, `GET /entities/own?profile`, `POST /entities/lookup { ueis[] }`                                                                                            | `Entity` from the store; the profile's `entityUei`; `EntityLookup` — 1 request per `MAX_UEI_BATCH` UEIs, the registration carries the exclusion flag                                                                                                                                             |
| `GET /source`, `GET /source/calls?operation&limit&offset`                                                                                                                        | `SourceStatus` — every source and bucket; the ledger newest first                                                                                                                                                                                                                                |
| `GET /spending/pulse?naics&psc&agency&awardFamily&lookback`                                                                                                                      | `SpendingPulse` — obligations by fiscal period over the lookback years and this year so far, the rest of the year projected; USAspending, free, snapshotted for the cache window                                                                                                                 |
| `GET /spending/breakdown?category&naics&psc&agency&awardFamily&from&to`                                                                                                          | `SpendingBreakdown` — the scope's obligations over a window ranked by agency, sub-agency, recipient, NAICS, PSC or state, each a share of the scope's whole                                                                                                                                      |
| `GET /spending/reach?naics&psc&agency&from&to&lanes`                                                                                                                             | `SpendingReach` — the scope's new contracts over a window cut down step by step: in the lanes named, placed as contracts of their own, won by a small business; then the last cut by award size                                                                                                  |
| `GET /spending/primes?naics&psc&agency&awardFamily&from&to&band`                                                                                                                 | `SpendingPrimes` — the scope's primes ranked by the subcontracts they reported within a size of subcontract, most recent first, saying how far the read reached; with `recipient`, the primes that reported paying that firm                                                                     |
| `GET /spending/awards/:id`                                                                                                                                                       | `AwardDetail` — one award by USAspending's id: holder, buyer, vehicle, obligations against its ceiling, both end dates, how it was competed, what was ordered under it when it is a vehicle, its largest subcontracts, and the open stored notices from the same buyer and code                  |
| `GET /spending/incumbents/:noticeId?samePsc`                                                                                                                                     | `NoticeIncumbents` — who may hold the work a stored notice is about: the awards in its NAICS code, and its product service code unless `samePsc=false`, ending inside `INCUMBENT_HORIZON_MONTHS`, kept to its own sub-agency; or the fact it lacks to be joined (`gap`), asking nothing          |
| `GET/PUT /profiles/:id/views`, `DELETE /views/:id`                                                                                                                               | `SavedView` — an address inside the client kept by name; a `PUT` under a kept name replaces its address                                                                                                                                                                                          |
| `GET /spending/horizon?naics&psc&agency&awardFamily&months`                                                                                                                      | `SpendingHorizon` — active contracts and IDVs ending inside the coming months, by month, with the soonest-ending rows, each joined at read time to the open stored notices sharing its NAICS and agency sub-tier; capped by `MAX_HORIZON_PAGES` and the pull deadline, saying how far it reached |
| `GET /spending/agencies`, `GET /spending/agencies/:toptierCode?fiscalYear&awardFamily`                                                                                           | `AgencyDirectory`; `AgencyOutlook` — budgetary resources by fiscal year with the cadence by period, sub-agencies and offices with new-award counts                                                                                                                                               |

```
curl -s localhost:3004/source | jq .data.buckets
curl -s -X POST localhost:3004/pulls -H 'content-type: application/json' -d '{"days":3}' | jq '.data.slices[]|[.name,.outcome,.received]'
curl -s 'localhost:3004/leads?naics=5415&deadlineWithinDays=30&limit=5' | jq '.data.leads[]|[.score,.tier,.opportunity.title]'
curl -s -X POST localhost:3004/awards/fetch -H 'content-type: application/json' -d '{"naics":["332710"],"from":"2026-06-01","to":"2026-09-29","sources":["sam.gov","usaspending"]}' | jq .data
```

## The web client (`packages/govcon-ui`, `pnpm govcon:start`, `:4202`)

Nine routes under one shell (the nav is one data table the bar, the titles
and the route announcer read; the active profile is one choice in the header
every page scores against): **Dashboard** (what to act on first — what is due this week across the tracked notices, firms and awards, what the daily warm and the daily pull raised, the open early notices and the best leads — then how much of the year's new work in the profile's codes was within reach, then the sources and a pull by hand, then the company's own registration; each a panel reading its own resource), **Search**
(the store over every filter, free, with the notices a buyer posts before it
solicits one press away; SAM.gov over every `QueryFilter` field, run and
saved, each saved search togglable into the daily pull and saying what its
last read brought in; the view is its address and is kept by name), **Pipeline**
(two views, the address naming the one in front: tracked notices by stage,
the stage changed in the row and the whole bid — stage, reminder, estimate
and notes — opened under it; and the tracked firms and awards, each kind
with its own stages, edited the same way), **Notice** (facts,
place and contacts, the attachments as public links, the score trace, the
description on demand, the awards of its solicitation and NAICS, who may
hold the work it is about when asked, the bid panel), **Intel** (fetch and
summarize awards, look registrants up; the view is its address and is kept
by name), **Spending**
(six free USAspending lenses over one scope bar — when the money moves by
fiscal period with the rest of the year projected, where it goes by agency,
recipient, code or state, how much of the new work was open to the profile,
which primes pass work down, what is expiring month by month, and an
agency's budget by year with its offices — the scope narrowed by six
declared facets, every chart with a data-table twin and a tooltip, every
panel with its provenance; the view is its address, opens on the profile's
NAICS and can be kept by name; its guide is [spending.md](spending.md)),
**Award** (one award's record: its holder, buyer and vehicle, what it can
reach, its end with and without options, how it was bought and whether it
carries a subcontracting plan, who works under it, and for a vehicle what
was ordered under it), **Firm** (one firm by UEI: its registration with its
website, and the spending lenses narrowed to it) and
**Settings** (profiles as editable data with the service's issues per
field; the sources and the full ledger). Every button that spends a request
says so. Pure components carry stories and specs; containers are specified
against a stubbed API. `NEXT_PUBLIC_GOVCON_URL` names the service.

## The profile

A profile is a validated document in the store (`govcon_search_profile`),
edited in Settings; the shipped Enfav profile (`packages/govcon/src/profiles/enfav.ts`)
seeds an empty store once with its eight NAICS searches flagged for the pull.

| Field                                    | What it drives                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `naics`, `psc`                           | Code families. A shorter code is the whole family under it — a six-digit NAICS matched exactly scores 1, a four-digit family 4/6. The store's `naics` lead filter matches families the same way; SAM.gov's `ncode` is exact.                                                                                                                                                                                                                                |
| `interests`                              | Declared phrases with aliases and weights, matched as whole tokens in the title.                                                                                                                                                                                                                                                                                                                                                                            |
| `entityUei`                              | The company's SAM.gov id; `GET /entities/own` and the dashboard's registration card read it.                                                                                                                                                                                                                                                                                                                                                                |
| `pull.pageSize`, `pull.maxPagesPerSlice` | Bound the spend per slice; what remains is reported as truncated. What a pull searches is the profile's saved searches flagged `includedInPull`, in `pullOrder`.                                                                                                                                                                                                                                                                                            |
| `leads.horizonDays`                      | A ranking reads only notices posted inside it (pushed down with the other gates).                                                                                                                                                                                                                                                                                                                                                                           |
| `scoring.weights`                        | One weight per factor — `naics psc interests setAside noticeType deadline history freshness` — summing to 1; the record is closed over the factor table.                                                                                                                                                                                                                                                                                                    |
| `scoring.setAside`                       | Prices by code and for unrestricted notices; a non-null code not in the map **excludes** (and is filtered in SQL).                                                                                                                                                                                                                                                                                                                                          |
| `scoring.noticeType`                     | Prices by SAM.gov's label, a default for unlisted labels, and an exclude list (filtered in SQL).                                                                                                                                                                                                                                                                                                                                                            |
| `scoring.deadline`, `scoring.freshness`  | Ascending day bands; a passed deadline or an inactive notice **excludes**.                                                                                                                                                                                                                                                                                                                                                                                  |
| `scoring.history`                        | Stored awards in the same NAICS inside `days`, `saturateAt` of them worth 1, with how many were the notice's own subtier.                                                                                                                                                                                                                                                                                                                                   |
| `scoring.tiers`                          | Score thresholds for `high` and `medium`.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `alerts`                                 | What is put to a person. After the daily warm: `endingWithinDays` (an award ending inside it; 0 none), `audience` (`scope` for the scope's awards and the tracked ones, `watched` for the tracked ones alone), `minObligated` (the least obligated on a scope's award) and `pulseAboveBand` — see [spending.md](spending.md). After the daily pull: `newLeadTier` (a stored notice ranked in this tier or a better one is raised once; `null` raises none). |
| `teaming`                                | What the company looks for in a prime: `subcontract.min` and `.max`, the size of subcontract it could take. The Primes lens ranks a prime by the subcontracts it reports inside it.                                                                                                                                                                                                                                                                         |

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
| `GOVCON_SPENDING_WARM_HOURS`                                                                | How often `serve` refreshes the default profile's spending lenses and runs the alert rules; default 24, `0` never. Never under a CLI command.                                                                                                         |
| `GOVCON_PULL_HOURS`                                                                         | How often `serve` runs the default profile's daily pull and raises its new leads; default 24, `0` never. Never under a CLI command. The cache window above still applies, so a second run inside it spends nothing.                                   |
| `NOTIFICATIONS_URL`                                                                         | The notifications bus every alert and its digest are published to; default `http://localhost:3005`. Refused at boot when it is not a URL.                                                                                                             |
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

The spending lenses (`core/spending/`) read through one more cache, the
snapshot table: a lens answer for a canonical query is stored once and served
again inside the same window the search cache uses (`SAM_GOV_CACHE_TTL_HOURS`),
so the client can switch tabs and scopes without a request; past the window
the lens refreshes through the gate — every USAspending page one ledger row
under its own operation (`series`, `breakdown`, `horizon`, `agency-budget`,
`agency-offices`, `agency-directory`, `freshness`) — and a refresh the
source refused serves the older snapshot as `stale`, saying so. A stored
payload is validated against the lens's schema before it is served; a walk
the source cut short is answered but not kept, so the next read walks
again; a read asked to refresh — the daily warm — skips the window and
replaces the row. The horizon walk pages USAspending by number (its keyset
cursor answers 503, measured 2026-10-13), is bounded by `MAX_HORIZON_PAGES`
per family and by the pull deadline, and says how far it reached; its rows
are joined on every read to the open stored notices sharing their NAICS and
agency sub-tier, never stored. Every answer carries its provenance and the
provider facts the adapter declares (the DoD 90-day publication delay, the
financial-data reveal lag). The warm's cadence and the bus it publishes to
are the two environment variables above; the alert thresholds are the
profile's `alerts`. The guide is [spending.md](spending.md).

A **target** is what the company pursues that is not a notice: a firm to
work with, by its UEI, or an award whose work may be bought again, by the
id its record is read by. It is a bid's sibling, in its own table, one row
per kind and subject, and each kind has its own stages (`TARGET_STAGES`): a
firm is identified, contacted, talked with and teamed with; an award is
watched, researched, positioned for and pursued; either can be passed on. A
target keeps a stage, a contact, a reminder and notes. Tracking a firm reads
nothing on a schedule. Tracking an award makes the daily warm read it.

**The daily pull runs by itself under `serve`.** Once at each start and
then every `GOVCON_PULL_HOURS`, the default profile's pull runs exactly as
`POST /pulls` runs it. It goes through the gate, so the budget bounds it,
and a search already pulled inside `SAM_GOV_CACHE_TTL_HOURS` answers
`cached`: a restart on the same day spends no request. A source with no key
is not asked. After each run, every stored notice the profile ranks in
`alerts.newLeadTier` or a better tier is raised once, in a digest of its
own ("2 new leads for Enfav LLC"), and listed in the dashboard's Alerts
panel with a link to the notice. The rule reads the store and not the
pull's report, so a lead a pull made by hand brought in is raised at the
next run, and so is one the bus refused.

**Which searches earn their place.** Every run of a saved search that
reads the source leaves on it what the read brought in: the records, how
many of them were new to the store, and how the profile ranks what it
carried, by tier, with what a gate keeps off the leads list. The Search
page's SAM.gov side shows it beside each search as "Last read brought". A
search that brings forty records a day and none of them listed costs a
request a day for nothing: take it out of the daily pull. A run the cache
window answered reads nothing and leaves the last yield as it was.

Two provider facts found by probing and worth remembering: SAM.gov's awards
search takes up to a hundred codes per request and counts pages in its
`offset` parameter; Entity Management's registration section carries the
exclusion flag, so the Exclusions API is never spent.

## Layout

| Where                                                                                                            | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/govcon/src/core/`                                                                                      | Pure: `budget/` (attempt, policy, gate), `ports/` (search, description, awards, entities, bids, profiles, searches, ledger, repositories, spending, snapshots), `plan.ts` (`resolveWindow`, `planPulls`), `pull.ts` (`runPull` with its deadline), `candidates.ts` (the SQL push-down), `scoring.ts` (`FACTORS`), `intel.ts` (`summarizeAwards`, the history index), `pipeline.ts`, `profile.ts` (the schema), `spending/` (the snapshot read-through, the body schemas, the fiscal-series alignment, the projection, the horizon walk, the agency alignment, the recompete join, one lens per file under `lenses/`), `alerts/` (the spending warm's rules, and the digest a person reads). A spec pins that nothing here reads a clock, the environment, the filesystem or the network. |
| `packages/govcon/src/modules/sources/`                                                                           | `http.ts` (attempts, retries, redaction), `sam-gov/` (search, descriptions, awards, entities over one transport; schemas, normalizers, fixtures from live responses; the env factory), `usaspending/` (the award search and one adapter per spending endpoint over shared filters, families and value readers; the declared disclosures), the ledger, `GET /source`.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/govcon/src/modules/{profiles,pulls,opportunities,bids,targets,awards,entities,spending,alerts,views}/` | One concern each: services, thin controllers with zod schemas beside them, MikroORM adapters under `persistence/`; `spending/warm/` (the daily warm, the tracked awards it reads, and its policy), `pulls/` (the pull, and the scheduler that runs it under `serve` and raises its new leads) and `alerts/` (the raiser whoever finds alerts hands them to, the ledger, the bus sink and the route that reads them back).                                                                                                                                                                                                                                                                                                                                                                |
| `packages/govcon/src/modules/app/`                                                                               | The composition root, `configure-app.ts` over `@sysdesign/nest-kit`, `serve-job.ts` (the lifecycle of a job `serve` starts on a cadence), the HTTP harness (`testing.ts`) and the surface's suite; awards, entities and spending have their `*.http.spec.ts` beside their modules.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/govcon/src/{cli,render}.ts`                                                                            | `parseOptions` → `execute(options, service, io)`; the renderers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/govcon-ui/src/`                                                                                        | `app/` (routes, `nav.ts`, `route-link.ts`), `components/` (the shell), `providers/` (the profile choice), `api/` (`request.ts`, the one request function; `client.ts` and `spending.ts`, the service by side), `features/<page>/` and the hooks every page shares (`use-address-view.ts`, `use-settled-draft.ts`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `packages/contracts/src/lib/govcon/`                                                                             | The vocabularies, bounds, records, request/response shapes, the shared formatting and the fixture builders.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `packages/db/src/entities/govcon-*.entity.ts`                                                                    | Eleven tables: opportunity, source call, search profile, saved search, saved view, bid, target, award, entity, spending snapshot, alert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Criteria `GOV-1..37` and `GOVU-1..25` in `packages/criteria`; every spec
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
