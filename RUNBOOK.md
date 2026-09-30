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
4. starts the API, the quality loop and the UI with `DB_PORT=5433`,
   `QUALITY_LOOP_URL=http://localhost:3003` and, by default,
   `QUALITY_LOOP_AUTH=claude-code`.

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
run needs a model. Two routes, in order of precedence:

- **API key:** export `ANTHROPIC_API_KEY` before `pnpm stack:up`; an explicit
  key outranks the subscription route.
- **Claude subscription (the stack's default):** `QUALITY_LOOP_AUTH=claude-code`
  runs every model call through this machine's Claude Code login via the Agent
  SDK — if `claude` is logged in, grading just works. No key is read or stored.

`QUALITY_LOOP_DETERMINISTIC=1` turns the model off whatever else is set — what
CI does. Without a model the loop derives no criteria (`POST /criteria`
answers 503 with the reason, and the studio shows the prompt's criteria as
unavailable), refuses nothing else, and a run that is started escalates
honestly with `llm-disabled` diagnostics and no score. `GET
/api/grading/availability` reports which case you are in; the UI reads it to
explain a disabled control instead of failing.

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
draft is claimed into a prompt). Re-derive the criteria with
`POST /api/prompts/:id/criteria` while no session has been graded against
them; afterwards the ids are frozen (409).

## Re-grading a stored design

A **failed** run (the loop lost the model mid-way, or was restarted) shows as
failed on the revision; the UI's retry resubmits the same design as a new
revision with a new run. A **complete** grade is immutable — iterate by
submitting the next revision.

## The AI coach

Stuck, or curious how a model would improve your current design? **Improve**
posts the draft to `POST /api/sessions/:id/improve`: the draft is stored as
your own revision (iteration 1 of the run), then the loop revises it up to
`maxIterations` times against the remediations its panel selected. Reading
the run (`GET /api/sessions/:id/improve/:runId`, which the coach tab polls)
imports every iteration that scored strictly higher than all before it as an
**AI-badged assistant revision** in your timeline, each with its own grade,
once. The coach uses the same model switches as grading; without a model the
button explains why it is disabled.

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
Stop the dev stack (`pnpm stack:down`) before `nx e2e studio-e2e`.

## Notes / gotchas

- Port **5433** (not the app default 5432) avoids a stale `:5432` container that
  may exist on a dev machine; the stack scripts export `DB_PORT=5433`.
- This durable `docker-compose` stack is the canonical **local** database. The
  committed Tilt/Kubernetes path (`tilt up`, `tilt/postgres/*`) is a separate,
  independent database — don't mix them, or each will show only its own runs.
  Under Tilt the loop runs with `QUALITY_LOOP_DETERMINISTIC=1` unless you set
  an auth route in its deployment.
- One-time migration of pre-existing runs into the named volume:
  `docker exec <old-container> pg_dump -U admin -d sysdesign --clean --if-exists`
  piped into `psql postgresql://admin:admin@localhost:5433/sysdesign`.
