# Browser session — the live recipe

The specs prove the pieces against fakes. This is the order to prove them
against the real loop, the real store and a real browser, once, on this
machine. Each step names what to read afterwards; stop at the first that does
not hold.

Nothing here runs while another session is measuring the store: every digest
below adds chunks to `quality-memory__v2__text-embedding-3-small__1536`, the
loop's memory collection — since the 2026-11 move a pgvector table in the
stack's own Postgres, not a Qdrant collection.

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
`counts.kept ≥ 1`; `store` completes with `counts.chunks`; the loop's memory
table holds exactly `kept` more chunks than before (the loop's boot line
`memory store ready: <collection> (N chunks)` names the collection; count
its `vec_…` table in the stack's Postgres); and

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
# or the Built In flow, on a profile of its own, with the one document its mission declares:
pnpm browser-session run --goal packages/browser-session/goals/builtin-apply.md \
  --profile builtin --headed --subject "Your Name" \
  --url "https://builtin.com/jobs/remote/hybrid?search=Software+Engineer&city=Los+Angeles&state=California&country=USA&allLocations=true" \
  --document resume=<path-to-résumé.pdf> --max-tasks 2 --max-minutes 45
```

`--url` opens the browser where the work begins, so no plan is ever made on
about:blank; `--subject` names whom the operator's answers are about, so the
facts they teach are self-contained. To run until a number of applications are
submitted, add `--target-done n` (with `--max-tasks` at least n): the session
ends `complete`, reason `target-reached`, once n units have closed `done`.

Under the memory brain (the shipped choice since 30 Oct 2026), a form page's
fields are answered by one `field-answer` run over the evidence recalled from
the memory space — the step's `fields.json` carries
`recall: {requests, evidence, latencyMs, fault}` — and each answer given on a
taught channel is written to the space at once as a fact of the subject's, the
record id landing on the decision row (`teaching_ref`).

Read, per form page under the loop brain (the shipped choice until 30 Oct
2026): one `form-memory` orchestration whose goal's index names
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

### When the time runs out

No unit starts once `--max-minutes` have elapsed, and a unit open then may
finish within the session file's `unitGraceMinutes`. Read the end from the
row: `termination_detail` says `…minutes elapsed, no unit of work open` when the
session ended at the limit after its last unit closed, and `…past the N-minute
grace of the unit of work still open` when the grace ran out. A plan that
closed its unit and went on to open the next ends the session at that step:
the run log says `step N: no unit of work starts — the session's time is up`,
and a question the plan would have asked after the close is never put.

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
record under `## Units of work` by stance — each named by its identity's
values within `UNITS_ON_RECORD_BYTES_BOUND`, the rest counted — and lists the forbidden ones in its index; a `taskStart`
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

## 7. Tabs and documents

A mission whose listing opens each item on a page of its own, and the item's
apply control a third page on another site, runs on the same engine: the
session follows the newest tab, and a unit's pages close with it. A click or
a key press is followed by the observe settings' `pageOpenWaitMs` wait for a
page it opened to register (measured 2026-10-30: 195 to 735 ms after the
click), and a click inside a link that declares a new page — its own
`target="_blank"` — by the longer `newPageWaitMs`, each wait ending the
moment the page registers (measured 2026-11-05/06: three title-link tabs past
the short wait in live headed sessions), so the step after a card click or an
apply link reads the opened tab; a tab that registers later still is read on
the step after, at the cost of one plan on the unchanged page. Then:

```bash
jq -r '.url' static/sessions/<id>/01-steps/NN/observation.json                   # the step after a card click reads the job page — never about:blank, never the listing still
jq -r '.history[-1]' static/runs/<step run id>/...                                 # or read `## Recent actions` of the next step's goal: "closed 2 page(s) the unit opened — ok — the page in front is <url>"
grep -n 'closed .* page(s) the unit opened' static/runs/<run id>/01-goal.md       # the next goal after a taskDone says how many pages closed and which page is in front
jq -r '.plan.actions[] | select(.kind == "upload") | "\(.ref) \(.document)"' static/sessions/<id>/01-steps/NN/plan.json   # an upload names a document, never a path
jq -r '.elements[] | select(.kind == "uploadable") | "\(.ref) \(.name) visible=\(.visible) value=\(.value)"' static/sessions/<id>/01-steps/NN/observation.json   # every file control, a hidden one under f1, f2…
```

What to read: after a `taskDone` the next `observation.json` is the listing at
the same `page=N`, and the goal's recent actions carry the close; on a form
step the file controls are listed whether or not the page shows them, the
upload lands as a value on the control in the next observation and as an
image in `captures.json`, and a plan that named a document the mission does
not declare, or a control that is no file control, carries the cut in
`plan.json`'s objections. `--document <name>=<path>` supplies the file for
each row of the mission's `## Documents`; the session refuses, before any row,
a declared document with no file, a file that is not there, or a file no
section declares.

## 8. In the cloud

The session runs headless as a scheduled Fargate task
([`docs/aws/deployment.md`](../aws/deployment.md)): the job function starts
it with `run --launch <name> --headless --wait-for-loop 8`, under
`BROWSER_CHANNEL=chromium`, `BROWSER_PROFILE_BUCKET=<the files bucket>`,
`BROWSER_PROFILES_DIR=/app/static/profiles` (the task's own disk — never EFS,
where Chrome's `SingletonLock` names another host and SQLite's locks do not
hold), `BROWSER_SESSION_DOCS_DIR=/app/static/docs`,
`BROWSER_SESSION_DUMP_DIR=/app/static/browser-session/sessions` (EFS, so the
dumps outlive the task), the loop, bus, advisor and memory-host URLs on the
app task, `BROWSER_SESSION_SUBJECT` and `MEMORY_TENANT` from SSM, and the
`DB_*` set with `PGSSLMODE`. The lifecycle, in order:

1. The lease: a `browser_session` row on the profile `running` with a beat
   younger than the session file's `liveness.staleAfterMs` refuses the task
   (exit 2), naming that session — one session per profile, before any file
   is touched.
2. The bucket's `docs/*` written under the docs dir; the profile put in
   place: `profiles/<name>.tar.gz` extracted over any stale directory (every
   run but the first; an archive holding no `<name>/` directory is refused by
   key), else `state/<name>.json` read, to seed a fresh profile (the first
   run), else the task is refused (exit 2), naming both keys and the push
   command: with a bucket set, a run with neither would go ahead signed out
   and archive that profile over any state pushed later.
3. The loop waited for: `/health` every 5 s for up to 8 minutes, since the
   app task may still be waking; silent past that, the task is refused.
4. The session as on the laptop: the brain bound, the advisors resolved, the
   documents checked, stale rows closed, the lease checked again on the
   row's own instant, the dump opened, the row written — refused as the
   session's own refusal when another task's row took the profile meanwhile,
   since the database admits one `running` row per profile
   (`browser_session_running_profile`, since 2026-11-12) — the rubrics
   derived, the browser opened — seeded with the state when step 2 read one,
   in a 1440×900 window — and the start URL opened.
5. Once the browser has closed, on every path out: the row beats once more,
   then the profile is archived back to `profiles/<name>.tar.gz` without its
   caches, its crash and metrics spools and the `Singleton*` lock; a failed
   save is one warning and leaves the exit code alone.

Once, from the laptop — both launches need a sign-in, so both states go up
before either launch runs; with a bucket set a run refuses until its profile
has a state or an archive:

```bash
pnpm browser-session export-state --profile linkedin --out /tmp/linkedin-state.json   # no session running on the profile; the launch's site is visited for its local storage
pnpm aws:files push /tmp/linkedin-state.json state/linkedin.json && rm /tmp/linkedin-state.json
pnpm browser-session export-state --profile builtin --out /tmp/builtin-state.json
pnpm aws:files push /tmp/builtin-state.json state/builtin.json && rm /tmp/builtin-state.json
pnpm aws:files push docs/ingestion/Resume_2026_c.pdf docs/Resume_2026_c.pdf             # the document the builtin launch names
pnpm aws:session run builtin                                                           # the first run seeds the profile
```

Read: the task's log says `profile builtin: fresh, seeded with its exported
sign-in`, then the session as in §3; the next run's says `profile builtin:
restored from its archive`, and `pnpm aws:files list profiles/` shows the
archive with its size. `export-state` refuses a profile this machine holds
no directory for, so a misspelled name never pushes an empty sign-in.

What the cloud cannot do: a sign-in check on the new device — a "confirm it's
you", a human check — needs a person; the session ends
`mission-stop/login-wall` (exit 0) and signs in nothing. Then: sign in again
on the laptop (`login`, which keeps the sign-in on the laptop's disk and
archives nothing — the laptop's cookies would not read in the cloud), export
and push the state again, and
`pnpm aws:files rm profiles/<name>.tar.gz` so the next run seeds afresh. The
task's egress IP changes with every run, so expect such a check more than
once. A question for the operator reaches Telegram alone — a task has no
terminal — and the prompt expiry and the rails bound the task's life.
