# job-application — the record a browser session applies against

`packages/job-application` keeps the record of the units a browser session
applied to — one row per application for one subject — and is the advisor the
session asks before every plan what is on record. It exists because the
LinkedIn Easy Apply sessions kept applying to companies already applied to:
nothing the session carried between sessions said which. Now a mission
declares what identifies a unit (`## Unit identity`: the company), names its
advisor (`## Advisors`: `job-application`), and the session composes what the
advisor answers into every goal — the companies to avoid as prose the planner
and the judges read, the units in progress elsewhere into the goal's index,
where the loop's limits validator cuts a `taskStart` naming one — and holds
every `taskStart` to the whole record it was composed with, listed in the goal
or not: one at a company on record to avoid is refused unless the mission
declares the exception (`## Taking a unit on record`) and the plan declares
`onRecordTaken: true`.

## Why it is shaped this way

The engines stay generic. `quality-loop` validates and judges a plan against
the facts in its goal, synchronously and replayably, so the facts must be in
the goal: the session puts them there. `browser-session` composes goals and
publishes what happened; it has ports to the outside and knows no domain: the
mission says which advisors, the environment says where (`UNIT_ADVISOR_URLS`),
the advisor says who it is (`GET /advisor`). Everything that knows what a
company or an application is lives here, behind two seams any domain uses the
same way:

- **The advisor protocol** (`lib/units` in `@sysdesign/contracts`): `GET
/advisor` answers `{id, facets}` — who the advisor is and which declared
  facets it keeps its record by; `POST /advice {subject, asker, facets}`
  answers `{advisor, units, omitted}` — one unit per identity, each with a
  stance (`forbid`: never started, the validator cuts a `taskStart` naming it
  and the session refuses one all the same; `avoid`: prefer another item, and
  the session refuses a `taskStart` at one unless the mission's `## Taking a
unit on record` declares the exception and the plan declares `onRecordTaken:
true` — a declaration the validator cuts while the page lists the control
  the mission ties the exception to) and a note
  in the advisor's words. The session renders a bounded number and counts the
  rest, and checks every unit answered at `taskStart`, rendered or not; the
  bound both sides read is `ADVICE_UNITS_BOUND`, so a request carries no
  limit.
- **The session's events** (`session.started`, `session.unit.opened`,
  `session.unit.closed`, `session.ended`), declared on the notifications bus
  and carrying the task row's own id, the unit's declared facets and the
  session's `maxMinutes`. The intake here is one subscriber of the bus, so a
  second listener costs nothing and the session never carries a domain's write
  address.

How the same two seams are enforced for any domain, walked as one refused
`taskStart` and one event path back to the record:
[`../quality-loop/domain-rules.md`](../quality-loop/domain-rules.md).

## The record and its lattice

A row is keyed by the session's unit id (a hand-entered one is minted), holds
the company as the page named it beside its `identity_key` — the contracts'
key, so "ACME" and "Acme" meet — and a status from a vocabulary the table is
`CHECK`ed against. A session's events move it along a monotone lattice: an
opened unit is inserted `in-progress` with `expires_at = opened + maxMinutes`
and never changes a row that exists; a closed unit is terminal
(`done → submitted`, `already-done → submitted-before`, `skipped`, `failed`)
and overrides anything, `abandoned` included; a session's end, and a new
session on the same profile and subject (one profile runs one browser), set
only what is still `in-progress` to `abandoned`. The same event twice changes
nothing; a `closed` that arrives without its `opened` is inserted with what
it says. A unit in progress past its session's declared lifetime stands as
abandoned without a sweep.

The stance is policy, not code (`config/policy/scatter.json`): a window in
days, a total map from every status to a stance or none — `in-progress →
forbid`, `submitted`, `submitted-before` and `abandoned → avoid` (a unit
interrupted after Submit may have gone through), `failed` and `skipped → none`
so a retry stays open — a list of values that identify no single employer (a
staffing agency), and the set-asides after which a company is avoided. The
owner's decision of 2026-10-11: scatter across companies with a 90-day window;
only a unit in progress in another live session is forbidden.

## The HTTP surface (`pnpm job-application:serve`, `:3006`)

| Route                                                                      | Returns                                                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /health`                                                              | `{ status: 'ok' }`                                                           |
| `GET /advisor`                                                             | `{data: {id: 'job-application', facets: ['company']}}`                       |
| `POST /advice {subject, asker, facets}`                                    | `{data: UnitAdvice}`; `400` for an asker that does not compare on `company`  |
| `GET /applications?subject&company&status&since&limit&offset`              | `{data: ApplicationDto[]}`, newest first                                     |
| `GET /companies?subject`                                                   | `{data: CompanyDto[]}`                                                       |
| `POST /applications {subject, company, label?, url?, status?, appliedAt?}` | `201 {data: ApplicationDto}` — the backfill and the application made by hand |
| `PATCH /applications/:id {status}`                                         | `{data: ApplicationDto}`; `404` for an unknown id                            |

Bodies and queries are checked at the door with the contracts' bounds (a
`400` names each issue); answers ride the `{data}` envelope.

## Running it

```bash
pnpm db:migrate                                   # the job_application table
pnpm notifications:serve                          # the bus, :3005
pnpm job-application:serve                        # :3006, subscribed as job-application.sessions
# in .env, for the session:
UNIT_ADVISOR_URLS=job-application=http://localhost:3006
```

Under Tilt the service is `job-application` (`k8s/local/deployment.yaml`),
reaching the bus by its in-cluster Service.

**Backfill before the first live run**, or the record starts empty and every
company already applied to is applied to again: enter the recorded companies
by hand — `pnpm browser-session sessions` and `show <id>` list each session's
units with their labels — through `POST /applications`, one per company with
its date; or run a mission over the site's own list of applied jobs whose
units close `already-done`, which feeds the record through the same protocol
with no code.

**Accepted gaps**, each with its repair: the bus unreachable past
`busRecovery.windowMs` when the session publishes a unit event (the session's
manifest lists `unsentEvents`; `pnpm browser-session replay-events <id>`
sends a session's events again from its rows, and the intake takes a replay
as nothing new); the service down past the bus's idle-subscription day (the
intake warns once of the gap on its next start; replay the sessions since);
two sessions choosing the same card within one planning window (the owner
runs one).

## What a second domain does

The engines change for none of this. A tenant — govcon bidding is the obvious
second one — writes:

1. A mission with `## Unit identity` (the facet a page shows: a solicitation
   number) and `## Advisors` (its id), and a `UNIT_ADVISOR_URLS` entry.
2. A table keyed by the session's unit id, with a projection onto the domain's
   own natural key and party — the facet resolved to the store's key by the
   record source — and `subject` read as the record's partition (a bidder
   profile there, a person here).
3. Statuses in the domain's vocabulary, with a one-way initial map from the
   session's outcomes and the later transitions (won, lost; interview, offer)
   the domain's alone.
4. `GET /advisor` and `POST /advice` over a `RecordSource`, and a subscriber of
   the four session topics that moves its rows along its own lattice.
5. A criteria family, a boundaries row, a layers spec with the advisor layer
   naming no domain word.

The STAR-story repository the project requires is a later tenant of this same
package: applications are the spine interviews and stories hang on.
