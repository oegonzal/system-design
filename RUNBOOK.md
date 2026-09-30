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

## Bringing your runs back in the future

```bash
# from the repo root, with the repo's Node on PATH
pnpm stack:up
```

This runs `scripts/stack.sh`, which:

1. starts the durable Postgres and the vector store (`docker compose up -d db
vectors`) — Postgres image `postgres:16-alpine`, **named volume**
   `sysdesign-pgdata`, host port **5433**; Qdrant image `qdrant/qdrant:v1.19.1`,
   **named volume** `sysdesign-qdrant`, host port **6333** (`QDRANT_URL`); both
   `restart: unless-stopped`;
2. waits for both to be ready (`pg_isready`, then `GET /readyz` on Qdrant);
3. applies any pending migrations (`pnpm db:migrate`, idempotent) and re-seeds
   the reference experiences (`pnpm db:seed`, idempotent — never touches your
   sessions);
4. starts the API, the quality loop and the UI with `DB_PORT=5433` and
   `QUALITY_LOOP_URL=http://localhost:3003`; the loop runs on this machine's
   Claude Code login.

`pnpm stack:down` stops both containers; the data stays in the named volumes.
`pnpm stack:db` brings up only the database and the vector store (for
tests/tools). The quality loop's memory runs need the vector store and, for
live embeddings, `OPENAI_API_KEY` in `.env` (Node loads the file on `serve`
and `quality-loop:run`); without either, memory steps skip with a stated
reason and the target pipeline still runs.

Because the volumes are named and the containers have `restart: unless-stopped`,
the database and the vector store return on their own after a Docker or machine
restart; `pnpm stack:up` then just re-attaches the app. Your sessions are
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

An API key in the environment is never used: it is withheld from the Claude
Code process, so nothing is billed outside the subscription. There is no way
to run the loop without a model. `serve` and `run` ask Claude Code whether it
is signed in before anything boots — an account check, no model call — and
exit 1 saying how to get a login when it is not; `replay` reads recorded runs
and needs none. A booted loop always has a model, so
`GET /api/grading/availability` (the loop's `GET /health`, proxied) either
names it or answers 503 because the loop is unreachable, and the UI reads it
to explain a disabled control instead of failing. `POST /criteria` answers
503 when the model derives no criteria, so a prompt is never stored without a
rubric, and a rewrite that cannot be derived leaves the prompt as it was.

A running run heartbeats its row, and the served loop's janitor sweeps at boot
and on an interval, failing as `Interrupted` only rows whose heartbeat is older
than `QUALITY_LOOP_RUN_STALE_AFTER_MS` (default `600000`, ten minutes; the
heartbeat is written every third of it). A run another process is still
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
after a restart) shows as failed on the revision; the UI's retry resubmits the
same design as a new revision with a new run. A **complete** grade is immutable — iterate by
submitting the next revision.

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

## Tests never touch your runs

Integration suites (`nx test studio-api`, `nx test quality-loop`) and the e2e
suite truncate tables between tests — so they default to their **own database,
`sysdesign_test`**, created and migrated automatically on the same Postgres
server (run them with `DB_PORT=5433` so they land on the compose server). Your
`sysdesign` practice history is never truncated by a test run. CI pins
`DB_NAME` explicitly and keeps its ephemeral service database. None of them
reaches a model: studio-api's specs bind a fake loop client, the loop's specs
a fake model, and Playwright starts a stub quality-loop server on :3103.

One caveat: Playwright reuses already-running dev servers locally. A reused dev
API points at `sysdesign` while the suite prepared `sysdesign_test`, so specs
may fail confusingly (your data still safe — nothing truncates `sysdesign`).
The `serve` targets are two plain processes (`vite build --watch` and
`node --watch`) that need no Nx daemon, so a dev API you left running is
rebuilt on every edit — and is still the one Playwright reuses. Stop the dev
stack (`pnpm stack:down`) before `nx e2e studio-e2e`.

## Notes / gotchas

- Port **5433** (not the app default 5432) avoids a stale `:5432` container that
  may exist on a dev machine; the stack scripts export `DB_PORT=5433`.
- This durable `docker-compose` stack is the canonical **local** database. The
  committed Tilt/Kubernetes path (`tilt up`, `tilt/postgres/*`) is a separate,
  independent database — don't mix them, or each will show only its own runs.
  Under Tilt the loop signs in with `CLAUDE_CODE_OAUTH_TOKEN` from the Secret
  `quality-loop-model`, which `packages/quality-loop/Tiltfile` builds at
  `tilt up` from the shell's variable, else from the repo's `.env` (a pod has
  no `claude login`; `claude setup-token` prints the token). With neither Tilt
  warns and the pod exits at boot with the loop's own message.
- Under Tilt the host reaches the API (3000), the loop (3003) and Postgres
  (5432) through Tilt's port-forwards only; the Services are `ClusterIP`. They
  used to be `LoadBalancer`, which Docker Desktop's Kubernetes turns into a
  host-published container on the same port, racing Tilt's forward. A cluster
  that ran the old manifests may keep a Service stuck deleting, and then Tilt
  reports `timeout waiting for delete`. Clear it once:
  `kubectl patch svc <name> --type=merge -p '{"metadata":{"finalizers":null}}'`,
  then `tilt trigger <resource>`.
- One-time migration of pre-existing runs into the named volume:
  `docker exec <old-container> pg_dump -U admin -d sysdesign --clean --if-exists`
  piped into `psql postgresql://admin:admin@localhost:5433/sysdesign`.
