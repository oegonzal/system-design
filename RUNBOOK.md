# Runbook — persistence & replaying past runs

## Are practice runs replayable after a shutdown and a future restart?

**Yes.** Every run is stored, not just cached:

- A **session** and each **revision** (the full `graph`, `brief` and `narrative`
  as JSON) are durable Postgres rows (`packages/db/src/entities/*`). Each
  revision points at the quality-loop run and iteration that graded it
  (`quality_run_id`, `quality_iteration`) and caches the terminal score and
  decision; the run itself — its criteria, every iteration's ledger of confirmed
  findings and criterion results, the decision trace and the model exchanges —
  lives in the `quality_run*` tables the loop owns. The database alone
  re-displays any past run; the audit dumps under `static/runs/` are optional
  and are never read by the app.
- A grade is a **model's judgement, recorded** — never recomputed. Re-reading
  a revision re-reads its run; nothing re-judges a stored design. To grade
  again, submit a new revision.
- Past sessions are reopenable from the **Dashboard** (`/`), which lists recent
  sessions, or directly at `/practice/<sessionId>`.

The only thing that has to persist for all of the above is the **database
volume** — which is what the durable local stack guarantees.

## Bringing your runs back: one stack, two launchers

There is one local stack, whichever launcher starts it:

- **The stores.** The `docker-compose` services are the one definition of
  each: `db` (image `postgres:16-alpine`, **named volume** `sysdesign-pgdata`,
  host port **5433**) and `vectors` (Qdrant, image `qdrant/qdrant:v1.19.1`,
  **named volume** `sysdesign-qdrant`, host port **6333**, `QDRANT_URL`), both
  `restart: unless-stopped`. `pnpm stack:db` brings them up and waits until
  both answer (`pg_isready`, then `GET /readyz` on Qdrant); both launchers
  begin with that same step.
- **The schema and reference data.** `pnpm db:migrate` applies any pending
  migrations and `pnpm db:seed` re-seeds the reference experiences; both are
  idempotent, and the seed never touches your sessions.
- **The apps.** The API (3000), the quality loop (3003), govcon (3004),
  notifications (3005), job-application (3006) and the three web clients
  (4200, 4201, 4202) find the stores and one another at their defaults, so no
  connection variable is set.

The launchers differ only in where the apps run:

```bash
# from the repo root, with the repo's Node on PATH
pnpm stack:up   # stores → migrate → seed → the API, the loop and the studio UI as local processes
tilt up         # stores → migrate → seed → the API, the loop, govcon and notifications as pods; the web clients locally
```

`pnpm stack:up` runs `scripts/stack.sh` and keeps the studio in the
foreground (Ctrl-C stops it); `pnpm govcon:start` and
`pnpm quality-loop-ui:serve` add the rest. Its loop runs on this machine's
Claude Code login. Under `tilt up` the pods reach the stores on the host
through `host.docker.internal` (the `local-stores` ConfigMap in
`tilt/stores/`), and `tilt down` removes the pods and the dev servers but
never stops the stores — so either launcher shows the same runs.

`pnpm stack:down` stops both containers; the data stays in the named volumes.
The quality loop's memory runs need the vector store and, for live
embeddings, `OPENAI_API_KEY` in `.env` (Node loads the file on `serve` and
`quality-loop:run`; under Tilt it rides in the loop's Secret, below); without
either, memory steps skip with a stated reason and the target pipeline still
runs.

Because the volumes are named and the containers have `restart: unless-stopped`,
the database and the vector store return on their own after a Docker or machine
restart; either launcher then just re-attaches the apps. Your sessions are
exactly where you left them.

## Grading needs a model

Grading, coaching and prompt generation are runs of the quality loop, and a
run needs a model. The loop runs only on a Claude Code subscription login,
through the Agent SDK:

- **On this machine:** `claude login` once — if `claude` is logged in, grading
  just works. Nothing to export.
- **Where there is no login (a Tilt/Kubernetes pod):** run `claude setup-token`
  and put the token it prints in the repo's gitignored `.env` as
  `CLAUDE_CODE_OAUTH_TOKEN=…` (or export it in the shell that runs `tilt up`).

No other credential is ever used: `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`
and `CLAUDE_CODE_API_KEY_FILE_DESCRIPTOR` are withheld from every Claude Code
process, so nothing is billed outside the subscription. There is no way to
run the loop without a model. `serve` and `run` ask Claude Code how it is
signed in before anything boots — an account check, no model call — and
accept only the first-party subscription: the machine login or the
setup-token token. Anything else (no login, a gateway token, a key helper, a
third-party provider) exits 1 saying what was found and how to get a login.
The check proves the credential is present, not that it is still valid: a
revoked token fails the first call instead, and that call's recorded
exchange carries the CLI's own reason (for example `authentication_failed`).
`replay` reads recorded runs and needs none. A booted loop always has a model, so
`GET /api/grading/availability` (the loop's `GET /health`, proxied) either
names it or answers 503 because the loop is unreachable, and the UI reads it
to explain a disabled control instead of failing. `POST /criteria` answers
503 when the model derives no criteria, so a prompt is never stored without a
rubric, and a rewrite that cannot be derived leaves the prompt as it was.

A running run heartbeats its row, and the served loop's janitor sweeps at boot
and on an interval, failing as `Interrupted` only rows whose heartbeat is older
than `QUALITY_LOOP_RUN_STALE_AFTER_MS` (default `180000`, three minutes; the
heartbeat is a ticker of its own, written every third of it whatever the
model is doing). A run another process is still
driving is left alone, so `pnpm quality-loop:run` beside the service is safe.
A loop restarted mid-run leaves its row `running` until the threshold passes;
then the row is failed and the revision shows failed — and if the original
process does finish later, its close reclaims the swept row with the real
outcome. A value that is not a positive integer of milliseconds refuses to
boot, by name.

A grade is slow on purpose: seven lenses, two samples each, serially on a
subscription — minutes per submission. The feedback tab polls the run and
shows the model calls as they are attributed.

## Author a prompt from your own assessment

A prompt is one markdown document. `POST /api/prompts` stores yours verbatim,
derives its criteria through the loop, and grades every session against those
ids for the prompt's life:

```
curl -X POST localhost:3000/api/prompts -H 'content-type: application/json' -d '{
  "title": "Order history for my account",
  "experienceId": "<experience uuid, optional>",
  "markdown": "# Order history for my account\n\n## Scenario\n\nYou own the order-history service …\n\n## Functional requirements\n\n1. …\n\n## Non-functional requirements\n\n| Kind | Requirement | Target |\n| --- | --- | --- |\n| latency | reads | p99 ≤ 300 ms |\n\n## Scale targets\n\n| Metric | Target |\n| --- | --- |\n| peak reads | 2,000 requests/s |\n\n## Constraints\n\n- …"
}'
```

The response carries `criteria` — `c1…cN`, each with a kind (`functional`,
`non_functional`, `scale`, `constraint`) and the statement the loop read. Two
other sources yield the same shape: `POST /api/prompts/import { libraryId }`
copies one of the loop's library documents (`GET /api/prompts/library`), and
`POST /api/prompts/generate { experienceId? }` starts a `design-prompt` run
over an experience (202; poll `GET /api/prompts/generate/:runId` until the
draft is claimed into a prompt — omitting the experience draws the least
practised one, in fixture order). A generated prompt's criteria are its
draft's own rows, one each, and are never re-derived (409). Re-derive a
written or imported prompt's with `POST /api/prompts/:id/criteria` while no
session has been graded against them; afterwards the ids are frozen (409).
Rewriting the markdown derives once, before anything is written, and makes
the prompt authored.

## Re-grading a stored design

A **failed** run (the loop lost the model mid-way, or its heartbeat went stale
after a restart) shows as failed on the revision, and is graded again in
place: `POST /api/revisions/:id/evaluation` starts a fresh run of the stored
design and points the same revision at it — no second revision. The same
call grades a revision whose run the loop no longer has, or one stored before
grading was delegated. It is refused (409) while a grade is running and once
one stands: a **complete** grade is immutable — iterate by submitting the
next revision.

## The AI coach

Stuck, or curious how a model would improve your current design? The coach
posts to `POST /api/sessions/:id/improve`, two ways:

- **From the draft** (the body is the submission plus `maxIterations`): the
  draft is stored as your own revision, iteration 1 of the run, and the saved
  draft is cleared.
- **From a graded revision** (`{ baseRevisionId, maxIterations? }` — what the
  workspace sends when the canvas is clean and the loaded revision's grade is
  complete): the loop adopts that revision's recorded grade verbatim as
  iteration 1, so nothing is graded or stored twice, and the draft is
  untouched. Only a completed grade of this session qualifies: 404 for another
  session's revision, 409 while it is still being graded, 422 when its run
  failed or it was graded before delegation.

Either way the loop then revises up to `maxIterations` times (default 3, at
most 10) against the remediations its panel selected. Every coaching run is
recorded on the session — `GET /api/sessions/:id/improve` lists them newest
first, which is what a reloaded workspace resumes polling. Reading a run
(`GET /api/sessions/:id/improve/:runId`, which the coach tab polls) imports
every iteration that scored strictly higher than all before it as an
**AI-badged assistant revision** in your timeline, each with its own grade,
once; an artifact the studio would refuse is reported `refused` with its
problems and never stored, and every row carries the controller's reason. A
coaching run that fails marks the draft revision failed only when the draft
was its base; an adopted revision keeps the grade of the run it came from.
The coach reaches the same loop as grading; while the loop is unreachable the
button explains why it is disabled.

## The draft, and one grade at a time

The unsubmitted canvas is a draft kept with the session: the workspace
autosaves it to `PUT /api/sessions/:id/draft` (shape-checked only — an empty
binding or a blank claim is fine), `GET /api/sessions/:id/draft` returns it,
and it is restored ahead of the latest revision when the workspace opens. It
is cleared by the submit or coach start it became; a closed session keeps
none (422).

Submits serialise on the session row: a second submit while the latest
revision is still being graded is 409 naming that revision (a grade that
finished unread is asked of the loop first, not refused), and a submit or
coach start on a session whose prompt was archived is 422 until the prompt is
reactivated — the session itself still reads.

## Export a run as portable files

The practice workspace's **Export** button downloads a single `.zip` with
`diagram.pdf` and separate `prompt.md` (the markdown plus its criteria),
`narrative.md`, `brief.md`, `feedback.md`, and `revisions.md` — a copy of a
run that lives outside the database entirely.

## Learning from a run that has already finished

A settled run can be turned into knowledge without re-running anything:

```bash
curl -s -XPOST localhost:3003/orchestrations/knowledge/from-run \
  -H 'content-type: application/json' \
  -d '{"runId": "<a complete quality run>"}'
# 202; poll GET /orchestrations/:id until it stops running
```

Four steps. The run stands in for `target` and is never re-run. `known` asks the
store what it already holds about that run's own confirmed findings and judged
criteria — no model call, and never the run's own points. `digest` runs the
`knowledge-digest` pipeline over the run plus what came back, and types what it
taught: a fact, an anti-pattern, a pattern, or a procedure. `store` writes one
point per item, one per confirmed finding of the judged iteration, and records
what the run claims about items other runs stored.

Read `steps.digest.counts` for `items`, `kept` and `confirming`, and
`steps.store.counts` for `items`, `findings`, `confirms` and `contradicts`. An
item that confirms something already stored is deliberately **not** a second
point: `confirming` counts those, and `confirms` is the rows they became. Running
it twice over one run replaces that run's own points and rows and leaves the
counts as they were.

Two reads, neither of which runs a pipeline or writes anything:

```bash
curl -s 'localhost:3003/memory/effectiveness?pipeline=system-design-canvas&limit=10'
curl -s 'localhost:3003/memory/gaps?runId=<a coach run>'
```

The first says, for every run that recalled, what became of each defect the
recall searched for — resolved, persisted, improved, regressed, unchanged, or
never judged again — and sums that per stored item. It attributes at run level
and says so: which lesson served which defect is prose on the curator's pack.
The second keeps the needs no recall could serve, grouped by brief, which is the
list of what the store has yet to learn.

## A browser session the loop decides for

`packages/browser-session` drives a headed Chrome through a **markdown goal**
— a mission, its unit of work, the procedure per unit, an answering policy,
stop conditions and never-do rules — and decides nothing itself. Each page is
a `browser-step` run that returns a bounded plan; each form page is a
`form-memory` orchestration that recalls facts about you from the memory
store without a model call — of what was recorded for one application, only
what was recorded for an application of the same identity as the page's:
with the Easy Apply mission, which declares the company as a unit's
identity, any application at that company — and runs `field-answer` over
them; a field the loop could not settle is put to you at the terminal and,
with the notifications service running, on Telegram at once — the first
answer is taken — and what you answer is taught back as a `guidance`
document naming the unit of work it was given in by that identity. The
LinkedIn Easy Apply flow is `packages/browser-session/goals/linkedin-easy-apply.md`;
the same program runs any goal.

Prerequisites: Postgres and the loop (`pnpm stack:db && pnpm db:migrate`,
then `pnpm quality-loop:serve` or the stack), Google Chrome installed, and a
signed-in profile:

```bash
pnpm browser-session login --profile linkedin --url https://www.linkedin.com/login
# Chrome opens on a persistent profile under static/browser-profiles/linkedin;
# sign in yourself, then press Enter in the terminal. Cookies persist there.
pnpm browser-session run --goal packages/browser-session/goals/linkedin-easy-apply.md \
  --profile linkedin --headed --max-tasks 5 --max-minutes 90
pnpm browser-session sessions            # what ran, how it ended
pnpm browser-session show <sessionId>    # units of work and every decision, by loop run id
```

When a field needs you, the field is outlined in Chrome and the question —
its options lettered, the loop's suggested value marked with why it was not
trusted — shows at the terminal and, when the notifications service runs, on
Telegram. Type or tap a letter, type the answer where the field takes one, or
fill the field in the browser and press Enter (`/readback`) and the value is
read back; `/blank` leaves it empty, `/stop` ends the session. Answer on either
channel: the other says who answered. An open question — one with no options —
is asked at once and asked again, a minute or two later, with suggested
answers lettered: from your record first, then drafts marked `transferable` or
`invented — not in your record`, as the goal's `## Suggesting policy` allows.
Pick a letter to use one whole, or answer before they come. On a long list,
type the option itself — "United States" — rather than hunting for its letter.
If the page refuses your answer, the question comes back saying why: choose
again, or fix the field in the browser and send `/readback`. A
session's trace — each step's observation, snapshot, screenshot and plan —
lands under `static/sessions/<id>/`, indexed like a run dump. The rows are
`browser_session`, `browser_task` and `browser_decision`.

Never commit `static/browser-profiles/`: it holds the signed-in cookies. It
is gitignored, as are the traces and the ingest manifest.

Before any of this is useful, give the store facts about you:

```bash
pnpm memory-ingest ingest docs/ingestion/Resume_2026_c.pdf --kind resume --scope subject --subject "Your Name" --dry-run   # what would be posted
pnpm memory-ingest ingest docs/ingestion/Resume_2026_c.pdf notes.md --kind notes --scope subject --subject "Your Name"    # posts, one chunk at a time
pnpm memory-ingest export-studio --out docs/ingestion/studio                             # your own experience profiles and STAR stories, as documents; practice withheld
pnpm memory-ingest ingest docs/ingestion/studio/studio-experiences.md --kind notes --scope subject --date <the day you exported>   # … ingested like any notes
pnpm memory-ingest status                                                                # how each chunk's digest went
```

The export writes only what the studio declares yours. An example written for
practice and a story drawn from one are withheld, and the report counts them
under that origin (a line such as `5 records · 1 withheld as practice`); the
practice highlights an experience of yours carries only so its prompts have a
scale to size from are never written either; and a document left with none of
yours is removed rather than kept stale. A studio running a build older than
origins serves none and is refused, exit 2; one whose database is migrated but
not yet seeded reads every experience as practice, so run `pnpm db:seed` before
exporting. Name the files you ingest: `studio-star-stories.md` states every
story drawn from no experience or from one of yours as yours, so ingest it once
each one is — not while a story saved trying the studio out is still there.
`--scope subject` declares the record yours wherever a form asks. `--date` is
the day you exported: the same command, date and all, after the record changes
posts only the chunks the change touched and then retracts the digests they
replaced, while a new date is in every chunk's goal and posts the document
whole again.

Each chunk is one `document-memory` orchestration: a `document-digest` run
turns the chunk into facts a form field could take, with grounding critics
in front of the store, and the manifest at `static/memory-ingest/manifest.json`
skips what was already ingested unless `--force`. Declare `--scope subject`
for a document about you: a file names no application, so a fact its digest
would scope to one is withheld rather than stored where no search reads it,
and `--scope unit` is refused. A chunk whose digest withheld one reads
`unstored` (`unit-unnamed`), and the document's earlier digests stand beside
what it did store until a run with `--scope subject` stores it whole and
retracts both. Reading it back the way a form page would —
the field's own words as the probe, both named vectors, the hits per field
type, the dealt evidence:
`POST :3003/memory/form-retrieval-report {"fields": [{"name": "How many years of TypeScript?"}]}`
should rank the fact first for that field. Add `"unitKey": "company=acme"` —
the key a page of an application at that company names in its goal's index —
to read what was recorded for applications at that company too; every hit
lists its kind, scope and unit.

### Standing answers: what every form asks and no résumé states

Screening forms ask the same dozen questions however they word them — work
authorization and sponsorship, where you live and whether you would move,
remote preference, salary, start date, references, the consents, whether you
have worked for the employer before — and a résumé states none of them. Say
each once, in a notes document you keep under `docs/ingestion/` (gitignored),
and the digest stores them as facts about you that hold wherever a form asks:

```markdown
# Identity and contact

Ada Lovelace's legal first name is Ada and legal last name is Lovelace.
Ada Lovelace's phone number is +1 555 010 0100 and email is ada@example.test.

# Work authorization and sponsorship

Ada Lovelace is a citizen of the country she works in and is authorized to work
there without restriction. Ada Lovelace does not require, and will not require,
employer sponsorship for a work visa.

# Location, remote and relocation

Ada Lovelace lives in Springfield and will work remotely, hybrid or on site in
Springfield. Ada Lovelace will not relocate.

# Compensation and start date

Ada Lovelace's expected base salary is $180,000 per year. Ada Lovelace can
start on 2026-11-02 and needs two weeks' notice.

# Employers

Ada Lovelace worked at Acme from 2021-03 to 2024-06 and at Globex from 2024-07
to the present. Ada Lovelace has not worked for any other employer since 2021.

# Consents

Ada Lovelace consents to a background check and to recruiting emails.
Ada Lovelace does not consent to recruiting text messages.

# References

Ada Lovelace provides references on request, after an offer is discussed.

# Links

Ada Lovelace's professional profile is https://example.test/in/ada.
```

Four rules make a sentence a fact the digest keeps: name the subject in each
sentence, one fact per sentence, figures absolute (`$180,000`, `2026-11-02`,
never "mid-November"), and a figure stated as a figure or a date, never as the
threshold a form once asked ("has used Node.js professionally since 2017-06",
not "at least 2 years of Node.js") — a threshold settles only that one
question, a figure settles every threshold a form will ever ask of it. Label
compensation as a minimum, a range and a desired figure, each its own
sentence. A fact about one employer belongs under
`# Employers`, dated, and so does one sentence each saying, in so many words,
that you answer No to having worked for, been referred to, or knowing anyone
at any organization other than those employers: that is what settles such a
question for an employer you never applied to, since an answer given about
another application settles nothing for this one — a page is never even
shown the answers given for an application at another company. The standing
answers are yours wherever asked, so the document declares it with
`--scope subject` — the scope test would otherwise bind "working or knowing
someone there" to one application, which a file never names, and withhold
it. Then:

```bash
pnpm memory-ingest ingest docs/ingestion/standing-answers.md --kind notes --scope subject --subject "Your Name" --date 2026-10-12
pnpm memory-ingest ingest docs/ingestion/standing-answers.md --kind notes --scope subject --subject "Your Name" --date 2026-10-12   # after an edit, same date: posts the chunks whose goals changed, then retracts the digests they replaced
pnpm memory-ingest ingest docs/ingestion/standing-answers.md --kind notes --scope subject --subject "Your Name" --date 2026-10-19   # a new date is in every chunk's goal: posts the whole document again, then retracts its earlier digests
```

A measured note: a plan costs four model calls and an answer page four more,
about 45 s each on the subscription login, so one application with three
form pages is roughly ten to twenty minutes of model time plus whatever you
type. Operator answers, and every value the session settled into a field, are
cached for the unit of work they were given in — with Easy Apply, every
application at the same company — by what the field asks.

## Scattering applications across companies

The Easy Apply sessions used to apply to companies they had applied to in an
earlier session: nothing carried between sessions said which. Now
`packages/job-application` keeps that record and the session asks it before
every plan, and the mission says what to do with the answer. Three things make
it work, and the session refuses to start — exit 2, before any row — when the
first two are missing:

1. **The service and the bus.** `pnpm notifications:serve` and
   `pnpm job-application:serve` (or `tilt up`); `pnpm db:migrate` once for the
   `job_application` table. The service subscribes to the session's events as
   `job-application.sessions` and answers `GET /advisor`, `POST /advice`.
2. **The session's environment.** `UNIT_ADVISOR_URLS=job-application=http://localhost:3006`
   in `.env`, and a subject of your own — `--subject "Your Name"` or
   `BROWSER_SESSION_SUBJECT` — since the record is kept per subject.
3. **The mission.** `## Unit identity` declares the fact a unit is known by
   (`- company: the company as the pane names it`), `## Advisors` names
   `job-application`, `## Taking a unit on record` says when a company on
   record to avoid may still be taken (`- avoid unless "Next": …` — not while
   a next page is listed; the loop's validator cuts a `taskStart` declaring
   `onRecordTaken: true` while the page lists that button), and the per-unit
   procedure says what to do with a company on record: prefer a card at another
   company, page forward before repeating. The session refuses a `taskStart` at
   a company on record to avoid unless the plan declares `onRecordTaken: true`
   under that exception; one at a company in progress in another session the
   loop's validator cuts and the session refuses regardless.
   `## Unit context` names the landmark whose
   words state what a unit is (`- landmark: main`), so a form's question about
   the company itself is answered from what the page laid out under that
   landmark as the unit opened — on this layout the results list and the opened
   listing's pane alike, which the goal says over it; `02-tasks.json` shows what
   each unit carried, with the node lines the bound left out counted.

Backfill first, or the record starts empty: `pnpm browser-session sessions`
and `show <id>` list every recorded unit with its label; enter each company
once with `curl -X POST localhost:3006/applications -H 'content-type: application/json' -d '{"subject":"Your Name","company":"Acme","appliedAt":"2026-10-03T10:00:00.000Z"}'`.
Then read the record: `curl 'localhost:3006/companies?subject=Your%20Name'`.

What to read after a session: `static/sessions/<id>/01-steps/NN/advice.json`
says what the advisor answered before each plan (`answered`, or `stale` with
the step the advice is from); the goal in the run dump renders the companies
to avoid under `## Units of work`; `manifest.json` lists `unsentEvents` when
the bus was down at the close, and `pnpm browser-session replay-events <id>`
sends a session's events again — the intake takes a replay as nothing new.
A unit a crashed session left in progress is abandoned by the next session on
the same profile, or stands as abandoned once the session's `maxMinutes` have
passed; `PATCH /applications/:id {"status":"submitted"}` confirms one that did
go through.

## Before changing a bound or a cap, measure

Every string and list a model writes into is one declared bound — a target the
model is asked for and a ceiling the schema accepts — and every stage declares
an output cap (`maxTokens`), which is also its call's time limit. Each is held
to what the model measurably writes by a committed fixture beside its
declaration: `packages/quality-loop/src/pipelines/<id>/measured.json` (the
deriver's and the producer's fields, every stage's output tokens),
`packages/quality-loop/src/core/stages/measured.json` (what every lens writes)
and `packages/contracts/src/lib/measured/<schema>.json` (the canvas a coach
writes and the prompt a drafter writes). **Before changing any bound or cap,
run `pnpm measure:bounds`:**

```bash
pnpm measure:bounds                                    # reads static/runs
pnpm measure:bounds --runs-dir=<dir> --since=2026-10-01
```

It only reads the dumps — each call's reply as written, from its text when that
parses and from its validated response otherwise, so a reply the seam refused,
kept past a ceiling or salvaged from a cut turn counts at the size the model
wrote — and rewrites the fixtures and
`packages/llm/src/fixtures/measured-calls.json` (the calls the time-limit spec
replays). Then the specs hold every declaration to them: a target at or above
the 99th percentile written, a ceiling above the longest, a cap a fifth above
the most its stage wrote on a turn that answered (a turn stopped by a limit or
an error measures the fault, not the stage). A renamed field, a new one nothing
measured, or a stage the definition no longer declares fails by name. Commit
the fixtures with the change they justify; a declaration held to no
measurement — a size a policy sets, a pipeline no run has recorded — is
exempted in its spec, with the reason.

## Tests never touch your runs

Every suite that touches Postgres — `nx test studio-api`, `quality-loop` and
`govcon`, and the e2e suite — empties tables between tests, so they run
against their **own database, `sysdesign_test`**, created and migrated
automatically on the same Postgres server. A `DB_NAME` of the form
`sysdesign_test_<lane>` gives a worktree or a parallel job a lane of its own.
Any other name is refused, with the database named in the error: the
harnesses (`bootApp`, `createHarness`) call `ensureDatabase` before they boot
anything, `truncateTestTables` asks the connection which database it is on
before it deletes, and the e2e config and global setup refuse before a server
starts. `pnpm test:tooling` keeps it that way: test code that boots an app or
an ORM must guard first, in the same file, and only the guarded doors may
empty a table: in SQL (`truncate`, an unfiltered `delete from`, `drop`), or
through the ORM (a query builder's `truncate()`, its `delete()` with no
`where` along the chain, `nativeDelete` with an empty `{}` filter, or the
schema generator's clear, refresh and drop). It reads the syntax tree, so a
filter passed in a variable is beyond it.
A `DB_NAME=sysdesign` left in a shell or in the `.env` Nx loads therefore
stops the suite instead of wiping your practice history. CI runs on `sysdesign_test` too, on its service's
server. None of them reaches a model: studio-api's specs bind a fake loop
client, the loop's specs a fake model, and the e2e suite a stub quality loop.

The e2e suite runs its own servers on its own ports — on `sysdesign_test`, the
API on :3200, the UI on :4300 and the stub quality loop on :3103
(`packages/studio-e2e/src/support/stack.ts`) — none of which the dev stack
uses, so Playwright can never reuse a dev server that writes into `sysdesign`.
A lane gets ports of its own, derived from its name
(`packages/studio-e2e/src/support/lane-ports.ts`): `DB_NAME=sysdesign_test_recall`
runs the API on :3281, the UI on :4381 and the stub on :3184, so two checkouts
on different lanes run side by side and never reuse each other's servers.
Should two lane names ever derive the same ports, the global setup refuses the
run: it plants a story in its own database, asks the API it found for it, and
removes it again before it resets anything — the API is sent that one read,
never a write into another lane's database. They build into their own outputs too (`packages/studio-api/dist/e2e`,
`packages/studio-ui/.next-e2e`), so a dev server running from the same
checkout is neither reused nor rebuilt under it. Leave the dev stack running;
the suite needs only Postgres (`pnpm stack:db`). Locally it reuses a server on
its own lane's ports that an earlier run left up, so a re-run skips the cold
start.

## Answering from your phone: the Telegram channel

`packages/notifications` is the project's event bus (`:3005`), and its
Telegram channel puts each prompt published on it in front of you as a
message from a bot — the question, its choices lettered `a`, `b`, `c`…, a
button per letter and per command — and brings your answer back as an
`interaction.answered` event for whoever asked. Tap a button, type the
letter, type your own answer where the prompt takes one, or reply to the
message you are answering when several wait.

There is one bot per purpose, and each carries only its own publisher's
prompts. `packages/notifications/config/channels/telegram.json` declares them
and binds each one's variables, as set in `.env`:

| Bot             | Carries           | Token                             | Username                         | Chat               |
| --------------- | ----------------- | --------------------------------- | -------------------------------- | ------------------ |
| job application | `browser-session` | `JOBAPPLICATION_TELEGRAM_API_KEY` | `JOBAPPLICATION_TELEGRAM_BOT_ID` | `TELEGRAM_CHAT_ID` |
| govcon          | `govcon`          | `GOVCON_TELEGRAM_API_KEY`         | `GOVCON_TELEGRAM_BOT_ID`         | `TELEGRAM_CHAT_ID` |

Pairing, once per bot:

1. Create the bot with BotFather, and put its token and its username (without
   the `@`) in `.env` under its variables. Without a token the service
   refuses to boot while `config/engine.json` chooses the `telegram` channels
   file; choose `"channels": "none"` to run the bus alone. A token that
   belongs to another bot than the username beside it refuses boot, naming
   both, so two bots' tokens can never be swapped unnoticed.
2. Start the service — `pnpm notifications:serve`, or `tilt up` — and send
   `/start` to the bot in Telegram. Until its chat is named the bot serves no
   one: it answers `/start` with your chat id and delivers nothing.
3. Put that id in `.env` under its chat variable and start the serve task
   again: `pnpm notifications:serve` afresh, or the Tilt resource restarted.
   Saving `.env` alone is not enough, although it does restart the process:
   nx loads `.env` into the environment it starts the task in, `node --watch`
   restarts its child with that same environment, and Node's env file never
   overrides a variable that is already set. So a value replaced in `.env`
   reaches a service only with a new serve task, while a variable new to the
   file arrives on the save. From then on the bot serves that chat alone and
   ignores every other. A private chat's id is your own Telegram id, so every
   bot that serves you privately reads the same `TELEGRAM_CHAT_ID`.

Telegram takes one poller per bot token: run the service under Tilt or with
`pnpm notifications:serve`, never both at once — the second is refused, and
the service logs it and waits. Two bots bound to one token refuse boot for
the same reason. A prompt nobody withdraws expires at the time
its asker gave it; the bot then edits its message to say so.

## Notes / gotchas

- Port **5433** is the app's default (`packages/db/src/connection.ts`) and
  avoids a stale `:5432` container that may exist on a dev machine. Only CI
  sets `DB_PORT`, to its service's 5432.
- Under Tilt the loop signs in with `CLAUDE_CODE_OAUTH_TOKEN` from the Secret
  `quality-loop-model`, which `packages/quality-loop/Tiltfile` builds at
  `tilt up` from the shell's variables, else from the repo's `.env` (a pod has
  no `claude login`; `claude setup-token` prints the token). `OPENAI_API_KEY`
  and `OPENAI_EMBEDDING_MODEL` ride in the same Secret, so memory runs in the
  pod as on this machine, and govcon's `SAM_GOV_API_KEY` reaches its pod the
  same way, through the Secret `govcon-sam`; so do the Telegram variables,
  through `notifications-telegram`, which the notifications Tiltfile builds
  from every variable the chosen channels file binds. With no token Tilt warns
  and the loop's pod exits at boot with the loop's own message.
- Under Tilt the loop's audit dumps land on the volume claim
  `quality-loop-runs`, mounted at its default `static/runs`, which outlives
  restarts and `tilt down`. Copy them out with
  `kubectl cp <quality-loop pod>:/app/static/runs <dir>`.
- Under Tilt the host reaches the API (3000), the loop (3003), govcon (3004),
  notifications (3005) and job-application (3006) through Tilt's port-forwards only; the Services are `ClusterIP`. They
  used to be `LoadBalancer`, which Docker Desktop's Kubernetes turns into a
  host-published container on the same port, racing Tilt's forward. A cluster
  that ran the old manifests may keep a Service stuck deleting, and then Tilt
  reports `timeout waiting for delete`. Clear it once:
  `kubectl patch svc <name> --type=merge -p '{"metadata":{"finalizers":null}}'`,
  then `tilt trigger <resource>`.
- One-time migration of pre-existing runs into the named volume:
  `docker exec <old-container> pg_dump -U admin -d sysdesign --clean --if-exists`
  piped into `psql postgresql://admin:admin@localhost:5433/sysdesign`.
