# Runbook — persistence & replaying past runs

## Are practice runs replayable after a shutdown and a future restart?

**Yes.** Every run is stored, not just cached:

- A **session**, each **revision** (the full `graph`, `narrative`, and `brief` as
  JSON), and each **evaluation** (overall score, grade, per-dimension scores,
  summary, `capApplied`, findings, advisory axes/scenarios) are durable Postgres
  rows (`packages/db/src/entities/*`). The database alone re-displays any past
  run — the audit dumps under `static/runs/` are optional and are never read by
  the app.
- Grading is **deterministic and version-stamped**: `ENGINE_VERSION` and the
  profile version are written onto every evaluation, and with no
  `ANTHROPIC_API_KEY` (or `EVAL_DETERMINISTIC=1`) the rules engine decides the
  grade alone, so re-evaluating a stored revision reproduces its score exactly.
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

1. starts the durable Postgres (`docker compose up -d db`) — image
   `postgres:16-alpine`, a **named volume** `sysdesign-pgdata`, `restart:
unless-stopped`, on host port **5433**;
2. waits for it to be healthy;
3. applies any pending migrations (`pnpm db:migrate`, idempotent) and re-seeds
   the reference experiences (`pnpm db:seed`, idempotent — never touches your
   sessions);
4. starts the API, eval worker, and UI with `DB_PORT=5433 EVAL_DETERMINISTIC=1`.

`pnpm stack:down` stops the database container; the data stays in the named
volume. `pnpm stack:db` brings up only the database (for tests/tools).

Because the volume is named and the container has `restart: unless-stopped`, the
database returns on its own after a Docker or machine restart; `pnpm stack:up`
then just re-attaches the app. Your sessions are exactly where you left them.

## Re-grading a stored design

A **failed** evaluation can be re-queued in place from the UI (or
`POST /api/evaluations/:revisionId/retry`). A **completed** one is immutable —
iterate by submitting a new revision. Either way the grade is deterministic, so
a re-run of the same design yields the same result.

## The AI coach (improvement runs)

Stuck, or curious how a model would improve your current design? **Improve with
AI** hands the canvas to a background improvement run: it submits your draft as
a base revision, then iterates — propose, validate, re-score with the same
deterministic engine that grades you — accepting only candidates that score
STRICTLY higher. Every accepted iteration lands in your timeline as an
AI-badged revision; the coach tab streams the trajectory live.

The coach is LLM-required: export `ANTHROPIC_API_KEY` before `pnpm stack:up`
(the stack sets `IMPROVER_DETERMINISTIC=0` so the coach runs live while grading
stays deterministic — the coach only proposes; the engine decides). Without a
key the button explains why it is disabled.

## Export a run as portable files

The practice workspace's **Export** button downloads a single `.zip` with
`diagram.pdf` and separate `prompt.md`, `narrative.md`, `brief.md`,
`feedback.md`, and `revisions.md` — a copy of a run that lives outside the
database entirely.

## Tests never touch your runs

Integration suites (`nx test studio-api`, `nx test eval-worker`) and the e2e
suite truncate tables between tests — so they default to their **own database,
`sysdesign_test`**, created and migrated automatically on the same Postgres
server (run them with `DB_PORT=5433` so they land on the compose server). Your
`sysdesign` practice history is never truncated by a test run. CI pins
`DB_NAME` explicitly and keeps its ephemeral service database.

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
- One-time migration of pre-existing runs into the named volume:
  `docker exec <old-container> pg_dump -U admin -d sysdesign --clean --if-exists`
  piped into `psql postgresql://admin:admin@localhost:5433/sysdesign`.
