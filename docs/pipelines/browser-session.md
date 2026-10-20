# Browser session — the live recipe

The specs prove the pieces against fakes. This is the order to prove them
against the real loop, the real store and a real browser, once, on this
machine. Each step names what to read afterwards; stop at the first that does
not hold.

Nothing here runs while another session is measuring the store: every digest
below adds points to `quality-memory__v2__text-embedding-3-small__1536`.

## 0. The stack

```bash
pnpm stack:db && pnpm db:migrate && pnpm db:migrate:check   # the three browser_* tables exist, no drift
pnpm quality-loop:serve                                      # :3003, signed in (claude login)
curl -s localhost:3003/pipelines | jq -r '.data[].id'        # lists browser-step, field-answer, document-digest
curl -s localhost:3003/health | jq .heartbeat                # the stale window the session's awaiting reads
```

A session refuses to start against a database that has not applied every
migration this checkout carries — exit 2, naming each one and the
`pnpm db:migrate` that applies them — before the browser opens.

## 1. Facts before forms

```bash
printf '# Notes\n\nYour Name — your@email.test — City, Country.\n\nSix years of professional TypeScript, 2020–2026, at Acme and Globex.\n' > /tmp/notes.md
pnpm memory-ingest ingest /tmp/notes.md --kind notes --scope subject --subject "Your Name" --dry-run   # one chunk, N sections, nothing posted
pnpm memory-ingest ingest /tmp/notes.md --kind notes --scope subject --subject "Your Name"             # 202 → polled → complete
pnpm memory-ingest status
```

Read: the orchestration's `digest` step reports `{kind: 'notes', …}` and
`counts.kept ≥ 1`; `store` completes with `counts.chunks`; Qdrant's
`points_count` rose by exactly `kept`; and

```bash
curl -s -X POST localhost:3003/memory/form-retrieval-report -H 'content-type: application/json' \
  -d '{"fields":[{"name":"How many years of experience do you have with TypeScript?"}]}' \
  | jq '.data.fields[0].fused[0]'
```

names the TypeScript fact first for that field, with `runId` the digest run's
id, `kind` `profile_fact` and `scope` `subject` — the form path's own recall
(the field's words as the probe, both named vectors, the hits its field type
takes), not the curated recall's `retrieval-report`, which derives probes with
a model and searches every kind. Then
`ingest docs/ingestion/Resume_2026_c.pdf --kind resume --scope subject` — a
file names no unit of work, so a document about you declares its facts the
subject's.

## 2. A benign session

```bash
pnpm browser-session login --profile smoke --url https://duckduckgo.com      # Chrome opens; press Enter
pnpm browser-session run --goal packages/browser-session/goals/smoke-search.md \
  --profile smoke --headed --max-tasks 1 --max-minutes 5
```

Read: exit 0; `pnpm browser-session sessions` shows the session `complete`,
ended by the mission's stop `mission-complete`; `show <id>` lists one unit of
work `done` and one `step-plan` decision per page, each with a `loopRunId`;
`static/sessions/<dumpId>/00-rubrics.json` names, per pipeline, the rubric and
the `<stamp>-criteria` dump of the call that derived it;
`ls static/sessions/<dumpId>/01-steps` has one folder per step with
`observation.json`, `snapshot.txt`, `screenshot.png`, `plan.json` — and, under
the chosen capture settings, `captures.json` with a `captures/` image of each
field entry; and
`select status, termination_reason, termination_cause, steps from browser_session order by started_at desc limit 1`
agrees. Repeat with `--headless`.

## 3. The mission

```bash
pnpm browser-session login --profile linkedin --url https://www.linkedin.com/login   # sign in yourself
pnpm browser-session run --goal packages/browser-session/goals/linkedin-easy-apply.md \
  --profile linkedin --headed --subject "Your Name" \
  --url https://www.linkedin.com/jobs/search-results/ --max-tasks 2 --max-minutes 45
```

`--url` opens the browser where the work begins, so no plan is ever made on
about:blank; `--subject` names whom the operator's answers are about, so the
facts they teach are self-contained. To run until a number of applications are
submitted, add `--target-done n` (with `--max-tasks` at least n): the session
ends `complete`, reason `target-reached`, once n units have closed `done`.

Read, per form page: one `form-memory` orchestration whose goal's index names
the open unit of work by its key (`unitKey`: the identity the mission
declares, or the task row's id when it declares none), whose `recall` step
counts `{probes, candidates, evidence}` — of the memories bound to a unit of
work, only that unit's — and whose `target` step reports `admission` and what
it withheld; an operator prompt only for a field the report withheld, the
model routed to you, or whose value rests on a kind the answering settings do
not fill — and none when a suggestion fills it (the answering settings'
`drafts`: by the shipped file every basis is typed, the record's own, a
transferable draft and an invented one alike, the withdrawal saying which),
or when you answered the same question earlier in the same unit; for each
answer given on any channel but one the operator settings' `untaught` names,
one `document-memory` orchestration at once, its document naming the unit the
answer was given in and the channel it came on, whose id lands on the
decision row it came from — the step's `teach.json` lists them; an answer on
a channel named there (the terminal, by the shipped file) is filled and
cached, recorded on its row with its channel (`via`), taught to nobody, and
the step says so. The dump's `fields.json` per
step names the route, source and channel of every field, and what became of
its suggestions.

To read why a step did what it did, walk its debate from the dump: the step's
`plan.json` names the loop run, and
[`docs/quality-loop/lens-debate.md`](../quality-loop/lens-debate.md) §4 lists
that run's files in the order to read them.

## 4. Pin the caps

From the runs above, `pnpm measure:bounds` reads `static/runs` read-only and
regenerates each pipeline's `measured.json` — what each stage wrote, field by
field and call by call; the `[QL-33]` assertion in each `definition.spec.ts`
holds the declared caps at a fifth above those.

## 5. A record beyond the session

A mission that declares `## Unit identity` and `## Advisors` runs only with the
advisors it names configured — `UNIT_ADVISOR_URLS=<id>=<url>[,…]`, or `none` —
and a subject of its own (`--subject`, or `BROWSER_SESSION_SUBJECT`); without
either the session is refused by name before it has a row. Then:

```bash
curl -s <advisor url>/advisor | jq .data                 # who it is, which declared facets it keeps its record by
pnpm browser-session run --goal <mission.md> --profile <name> --subject "Your Name" --max-tasks 2
cat static/sessions/<id>/01-steps/01/advice.json         # what the advisor said before the first plan, and what the goal was composed with
pnpm browser-session show <sessionId>                    # each unit with its identity beside its label
```

What to read: `advice.json` per step — `answered` on every step, or `stale`
with the step the advice is from and the fault that opened the streak; the
goal in the run dump (`static/runs/<runId>/01-goal.md`) renders the units on
record under `## Units of work` by stance — `UNITS_ON_RECORD_BOUND` of them,
the rest counted — and lists the forbidden ones in its index; a `taskStart`
naming one is cut by the limits validator and the next plan's objection says
so, as is one declaring `onRecordTaken: true` where the mission declares no
exception (`## Taking a unit on record`) or the page lists the control the
mission ties it to. The session then holds every `taskStart` to the whole
record the step was composed with, listed or not: one at a unit on record to
avoid is refused unless the mission declares the exception and the plan
declares `onRecordTaken: true`, a forbidden one whatever either declares. A
refusal is in the step's log line (`unit-refused`) and in the next step's goal
(its run's `01-goal.md`: the history's `not-executed` entry with the fact, the
objection at `action.N` with the reason); `plan.json` is the plan as read back
before it ran, so its `executePrefix` is the validator's, not the session's.
`manifest.json` lists `unsentEvents` when the bus was down past
`busRecovery.windowMs` at the close; `replay-events <id>` sends a session's
events again from its rows.

## 6. A unit's own words

A mission that declares `## Unit context` (`- landmark: main`) carries, with
each unit, what the page stated under that landmark as the unit opened. Then:

```bash
jq -r '.[] | "\(.label): \(.context.text // "" | utf8bytelength) bytes, \(.context.omitted // 0) node lines past the bound"' static/sessions/<id>/02-tasks.json   # one statement per unit; 0 for none
grep -n -A 6 '^## Open unit of work' static/runs/<form run id>/01-goal.md   # the form goal states it under the unit, titled by its landmark and the nodes shown
jq -r '.composition.rung' static/sessions/<id>/01-steps/NN/fields.json      # full | statement-cut | without-statement: how the form goal fitted the budget
```

What to read: a field asking about the organisation itself — its mission, its
work — is answered (`rests unit`, filled as `config/answering/standard.json`
says) or drafted from that statement, where before it went to the operator
with no draft; a `null` context on a unit means the mission declares no
landmark or the page laid out none. The statement is the landmark's, not the
unit's alone: on the shipped layout it names the other listed items before the
opened one, the goal's title over it says so and counts the nodes shown, and
the lenses read what it says of another item as no statement about this one.
