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
pnpm memory-ingest ingest /tmp/notes.md --kind notes --subject "Your Name" --dry-run   # one chunk, N sections, nothing posted
pnpm memory-ingest ingest /tmp/notes.md --kind notes --subject "Your Name"             # 202 → polled → complete
pnpm memory-ingest status
```

Read: the orchestration's `digest` step reports `{kind: 'notes', …}` and
`counts.kept ≥ 1`; `store` completes with `counts.chunks`; Qdrant's
`points_count` rose by exactly `kept`; and

```bash
curl -s -X POST localhost:3003/memory/retrieval-report -H 'content-type: application/json' \
  -d '{"goal":"How many years of experience do you have with TypeScript?"}' | jq '.data.candidates[0]'
```

names the TypeScript fact first, with `runId` the digest run's id and
`pipeline` `document-digest`. Then `ingest Resume_a2.pdf --kind resume`.

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

Read, per form page: one `form-memory` orchestration whose `recall` step
counts `{probes, candidates, evidence}` and whose `target` step reports
`admission`; operator prompts only for fields a judge faulted, the model
routed to you, or the model answered with low confidence; after each
`taskDone`, one `document-memory` orchestration whose id lands on that unit's
operator-sourced decision rows. The dump's `fields.json` per step names the
route and source of every field.

To read why a step did what it did, walk its debate from the dump: the step's
`plan.json` names the loop run, and
[`docs/quality-loop/lens-debate.md`](../quality-loop/lens-debate.md) §4 lists
that run's files in the order to read them.

## 4. Pin the caps

From the runs above, `pnpm measure:bounds` reads `static/runs` read-only and
regenerates each pipeline's `measured.json` — what each stage wrote, field by
field and call by call; the `[QL-33]` assertion in each `definition.spec.ts`
holds the declared caps at a fifth above those.
