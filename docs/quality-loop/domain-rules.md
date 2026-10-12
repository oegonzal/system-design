# Domain rules in the loop — the record stays outside, the fact rides in the goal

How a rule that belongs to one domain — "never apply to Acme twice" — is
enforced by two engines that know no domain: `quality-loop`, which judges a
plan against the facts in its goal, and `browser-session`, which composes
goals and publishes what happened. The record of applications, its routes and
its lattice are the domain's own page:
[`../job-application/overview.md`](../job-application/overview.md). The
convention a domain follows — section, index field, validator rule, Limits
line, rendering, port, topic — is stated once in
`packages/browser-session/README.md`, "A record beyond the session"; this page
walks it, with the job-application record as the first tenant.

The answer in one sentence: the domain keeps a record and advises; the
session composes the advice into every goal as declared facts; the loop's
validator cuts what the facts forbid and its judges read the rest as prose;
the session publishes what happened, and the record moves.

## Who knows what

| Party                                | Knows                                                                                       | Says                                                                                                                                                | Never knows                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Mission (`goals/*.md`)               | which facts identify a unit (`## Unit identity`: `company`) and who advises (`## Advisors`) | the procedure: page forward before a company on record is taken again                                                                               | where any service runs                   |
| Environment                          | where each advisor runs (`UNIT_ADVISOR_URLS`)                                               | —                                                                                                                                                   | what an advisor's facets mean            |
| Advisor (`packages/job-application`) | the record: one row per unit, keyed by the identity the mission declared                    | `GET /advisor`: who it is and which facets it keeps the record by; `POST /advice`: the units on record for a subject, each with a stance and a note | what a page, a card or a plan is         |
| Session (`browser-session`)          | which advisors the mission names, and their answers                                         | the goal — units to avoid as prose, units forbidden in the index — and the events                                                                   | what `company` means; it copies a name   |
| Loop (`quality-loop`)                | the index fields `unitFacets` and `unitsForbidden`                                          | a cut at `action.N`, with the advisor's note                                                                                                        | what a company or an application is      |
| Record (`job_application`)           | every unit opened or closed, by the engine's unit id                                        | —                                                                                                                                                   | the session's rows; it reads events only |

## A taskStart refused

```text
record                     session                                  loop
  │ POST /advice {subject, asker, facets} ◀──┤
  ├──▶ {units: [Acme · forbid · "in progress in another session",
  │             Globex · avoid · "applied 2026-10-03"], omitted: 0}
  │                          ├─ compose the goal
  │                          │    ## Units of work  both, as prose, by stance
  │                          │    ## Limits         "a unit on record as forbidden
  │                          │                       is never started"
  │                          │    ## Index          unitFacets ["company"],
  │                          │                      unitsForbidden [Acme]
  │                          ├─ POST /runs {pipeline: browser-step, goal} ──▶ producer:
  │                          │                                   action.1 click the card
  │                          │                                   action.2 click Easy Apply
  │                          │                                   action.3 taskStart company "Acme"
  │                          │                                 limits validator, index only:
  │                          │                                   matchesRecord → cut at action.3,
  │                          │                                   the advisor's note said back
  │                          │                                 critics and evaluators judge the prose
  │                          ◀─ the run and its validation report ─────────────┤
  │                          ├─ run action.1–2; the objection reaches the next
  │                          │  plan, which chooses another company
```

Where it lives: `contracts/src/lib/units/identity.ts` (`identityKey`,
`matchesRecord` — one key, shared by the validator and the record),
`contracts/src/lib/browser-session/step-index.ts` (`unitFacets`,
`unitsForbidden`), `quality-loop/src/pipelines/browser-step/validators.ts`
(`facetsFault`, `forbiddenFault`), `browser-session/src/core/unit-advice.ts`
(`recallAdvice`). How the lenses are run over that goal and where a cut
becomes a decision: [`lens-debate.md`](lens-debate.md) §1–§2.

## What happened, back to the record

```text
session                              bus topic                record (job_application)
taskStart company "Acme"        ──▶ session.unit.opened  ──▶ in-progress,
  {unit.id, facets, maxMinutes}                              expires_at = opened + maxMinutes
taskDone done {unit, outcome}   ──▶ session.unit.closed  ──▶ submitted; already-done →
                                                             submitted-before (terminal)
the session ends, a unit open   ──▶ session.ended        ──▶ abandoned
the next session, same profile  ──▶ session.started      ──▶ a dead session's open units →
  and subject                                                abandoned
the next POST /advice           ◀── stance by policy, config/policy/scatter.json:
                                    in-progress → forbid; submitted, submitted-before,
                                    abandoned → avoid for 90 days; failed, skipped → none
```

Running the service, the bus and the backfill, and what to read after a
session: `RUNBOOK.md`, "Scattering applications across companies", and
[`../pipelines/browser-session.md`](../pipelines/browser-session.md) §5.

## What is guaranteed, and what is only advised

Only one thing is cut deterministically: a `taskStart` whose declared
identity matches a unit on record as `forbid` — under the shipped policy, a
unit in progress in another live session. A company applied to within the
window is `avoid`: prose the planner and the judges read, and the mission's
procedure says to page forward before any such company is taken again. The
third guard is the page's own: a card the page marks as applied to (the
mission's `## Marks`) is passed over, and a listing opened anyway closes
`already-done`, which reaches the record as `submitted-before`. So "never
twice" is exact for a unit another session holds, strong for a company on
record, and measured rather than assumed for the rest: over the live sessions
since the record existed, five applications and zero companies in common with
it.

## Why the facts live in the goal

The loop validates and judges synchronously and replayably. A validator is an
exact check over the artifact and the goal's fenced index, with no model and
no port; the lenses read the prose. Everything a run read is in its dump's
`01-goal.md`, so `main.js replay` re-decides a recorded run with no model and
no advisor, and a validator that called a service would break both. The
session, which has the ports, puts the facts there before each plan.

## Three strengths

- **Exact.** `facetKey` normalises a value once — trim, NFKC, lower-case in
  one locale — and `matchesRecord` compares declared facets by that key; the
  validator and the record use the same function, so they cannot disagree.
- **Generic.** The engine compares declared names and never learns a meaning.
  A second domain writes two mission sections, two routes and one subscriber;
  neither engine changes.
- **Auditable.** Every step's `advice.json` records what the advisors said; a
  cut sits in the run's validation report;
  `pnpm browser-session replay-events <id>` republishes a session's events for
  a record that missed them.

## A second domain

What a tenant writes, item by item:
[`../job-application/overview.md`](../job-application/overview.md), "What a
second domain does".
