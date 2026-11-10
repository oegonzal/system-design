# The pipelines: how many there are, where the model sits, where the engine sits

A map of every path in this app that generates or grades something. The
engine's internals — stages, normaliser, policy, controller — are covered in
[`../pipeline-best-practices/quality-loop.md`](../pipeline-best-practices/quality-loop.md);
this page sits one level above it and links down rather than repeating it.
Known issues and deferred improvements across every pipeline are tracked in
[`../issues/README.md`](../issues/README.md).

Two facts organise everything below:

1. **Every model call in the studio is a quality-loop run.** The studio API
   holds no rubric, no rule, no critic and no client of its own: it validates
   structure, starts runs, stores what comes back, and maps the loop's ids onto
   the canvas. Three of its paths start runs; nothing else in it talks to a
   model.
2. **The model never authors a number.** Every lens answers in a schema of
   categories and ordinals locked to the ids on the page, a critic's two samples
   must agree and an evaluator's three settle a criterion by median, and the
   loop's deterministic controller prices and decides. What the
   studio shows is the decision and its trace.

---

## 1. The studio's four paths, at a glance

| #   | Path              | Trigger                                                                                                                                                               | Pipeline               | Iterations           | What the studio stores                                                                                                                       |
| --- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Prompt generation | `POST /prompts/generate` → 202; `GET /prompts/generate/:runId` claims the draft                                                                                       | `design-prompt`        | 2                    | a `prompt_generation` row keyed by the run; the claimed `prompt`                                                                             |
| 2   | Grade             | `POST /sessions/:id/revisions` → 201; `GET /revisions/:id/evaluation` polls                                                                                           | `system-design-canvas` | 1                    | the revision, pointing at `(runId, 1)`; the terminal score and decision, cached                                                              |
| 3   | Coach             | `POST /sessions/:id/improve` → 202 (the draft, or `{ baseRevisionId }` to adopt a graded revision); `GET /sessions/:id/improve` lists; `GET …/improve/:runId` imports | `system-design-canvas` | `maxIterations` ≤ 10 | a `coaching_run` row; the draft as revision `(runId, 1)` or nothing new for an adopted base; every strictly better iteration as `(runId, k)` |
| 4   | Interview turn    | `POST /sessions/:id/interview/clarify` or `…/probe` → 202; `GET /sessions/:id/interview` claims the reply once                                                        | `interview-turn`       | 1                    | an `interview_turn` row per turn, the interviewer's keyed by the run; the transcript composed onto the next submit                           |

Beside them, without a run: `POST /prompts` stores markdown the author wrote,
`POST /prompts/import` copies a document from the loop's library, and both —
like every written or imported prompt the first time it is read — derive
their criteria through `POST /criteria`, one model call and no run. A
generated prompt's criteria are its draft's own rows and need no call.

```
studio-ui ──HTTP──► studio-api ──── QualityLoopClient (port) ──► quality-loop :3003 ──► Postgres
                       │                                              │                  quality_run*
   prompt (write/import/generate) ─ POST /criteria ─────────────────►│ derive stage
   (1) generate ─────── POST /runs { design-prompt, goal: experience }►│ writer → critics → evaluator → controller
   (2) submit ────────── POST /runs { system-design-canvas, output, criteria, 1 }
   (3) coach ─────────── POST /runs { system-design-canvas, output | adopt, criteria, n }
                       ◄──── GET /runs/:id ── the trace: iterations, ledger, decision, remediations
```

---

## 2. Prompts

`packages/studio-api/src/modules/prompts/`. A prompt is one markdown document
and the criteria the loop derived from it. Three sources, one row:

- **Written** — `POST /prompts { title, markdown, experienceId? }` stores the
  text verbatim after deriving its criteria; a grader without a model answers
  503 and nothing is written.
- **Imported** — `POST /prompts/import { libraryId }` copies one of the loop's
  library documents (`GET /prompts/library`, `GET /prompts/library/*id` are
  proxies).
- **Generated** — `POST /prompts/generate { experienceId? }` renders the
  experience (title, company label, summary, stack, and its highlights with
  its practice highlights as the last bullets — the label is there so the
  fidelity critic can catch it leaking; whether the experience is the
  subject's own or an example written for practice never reaches the goal)
  as the goal of a `design-prompt` run and remembers the run in
  `prompt_generation`. Reading
  the run once it is complete parses its best artifact with
  `designPromptDraftSchema`, renders it to the house markdown with
  `renderDesignPromptMarkdown`, and claims it into a prompt with a
  conditional update, so two concurrent polls create one prompt. Its rubric is
  `criteriaFromDraft` (contracts): one criterion per row of the draft, in
  render order — the draft was judged row by row, so no second derivation.
  Omitting the experience picks the least practised one, in fixture order.

Criteria are `c1…cN` with kinds `functional`, `non_functional`, `scale`,
`constraint`; they are stable for the prompt's life and can be re-derived
(`POST /prompts/:id/criteria`) only while no session has been graded against
them and the prompt is not generated (409 either way). A rewrite of the
markdown derives the new rubric before anything is written — a grader that
cannot derive leaves the prompt exactly as it was — and makes the prompt
`authored`, since what it was generated or imported from no longer describes
it.

---

## 3. Grade

`packages/studio-api/src/modules/sessions/`. Submitting a revision:

1. **Validate structure.** Shape errors from `designSubmissionSchema` are
   `400`; referential problems are one `422` listing every one — an edge to a
   node that is not there, a carry neither endpoint declares, a binding to a
   criterion the prompt never derived or a node the canvas does not hold, a
   path that does not connect, a rationale for a node that is not drawn
   (`submission.ts`). Nothing here says whether the design is any good.
2. **Lock the session, then start the run before writing.** The rubric is
   made sure of first (a derivation can take minutes and must not hold the
   row); then, under a write lock on the session row (`withSessionLock`): the
   session is open and its prompt not archived (422), no earlier grade is
   still in flight (409 naming the revision — the cache says `running` until
   read, so the loop is asked first), and only then
   `startRun({ pipeline: 'system-design-canvas', goal: prompt.markdown,
output: { graph, brief, narrative }, criteria: prompt.criteria,
maxIterations: 1 })`. A loop that refuses rolls the transaction back.
3. **Store the revision** pointing at iteration 1 of that run
   (`createRevision`, dense numbering) and clear the session's draft, in the
   same transaction.
4. **Read the grade back.** `GET /revisions/:id/evaluation` fetches the run
   and maps its iteration (`evaluation.mapper.ts`): score, decision, its
   reason and dimensions from the controller — `overall` null when no
   dimension was assessed, never the controller's zero; findings from the
   ledger with every `locationRef` grounded onto the graded submission by
   `submissionLocations` (contracts) as a label, a part and a key, and the
   lens's rationale beside them; a result per criterion. The terminal score,
   decision and status are written back onto the revision so lists and
   timelines never fetch the loop. A revision graded before delegation has
   no run pointer and no evaluation; the client shows a notice instead of
   asking.

Inside the run, the canvas pipeline's `references` validator repeats the
studio's three checks, so what the studio refuses and what the loop blocks
cannot differ. A produced artifact — the coach's — is a change set against the
best, applied by `applyCanvasChange` (upserts by id in place, removals with the
node→edge cascade, positional lists replaced whole; the change set is the revise
shape the pipeline's output declares), and then passes the output shape's
`normalize` before any validator: `repairSubmission` drops the bindings and
narrations that name nothing on the graph, so a fan-out never blocks on a
stale reference; a provided artifact is never repaired. When an iteration is
still blocked, its validator notes reach the next produce as a refusals
section of the briefing. Six critics — requirements, model, structure,
communication, fitness, explanation — at two samples and four evaluators —
coverage, design, qualities, reasoning — at three, reading the canvas apart from
the critics, judge it, and the pipeline's own controller decides.

---

## 4. Coach

The same run with more iterations, and every run recorded on its session in
`coaching_run` (`GET /sessions/:id/improve` lists them newest first — what a
reloaded workspace resumes polling). `POST /sessions/:id/improve` starts one
of two ways, both under the session lock and the same guards as a submit:

- **From the draft:** validated exactly as a submission, started with
  `output` and `maxIterations` (default 3, at most 10), the draft stored as
  the author's own revision `(runId, 1)` and the session's draft cleared.
- **From a graded revision** (`{ baseRevisionId }`): the revision must be
  this session's, hold a run pointer, and its grade must be `complete` —
  asked of the loop first — else 404 / 422 / 409 while still running. The run
  is started with `adopt: { runId, iteration }` instead of `output`; the loop
  copies that recorded iteration verbatim as iteration 1 in mode `adopted`,
  so nothing is graded or stored twice, and the draft is untouched.

From iteration 2 on the loop's producer — the canvas pipeline's coach
persona, briefed with the criteria ids so it can bind an unbound one —
revises against the remediations the controller selected (the twelve worst a
round, validator notes first, under the pipeline's
`briefing.remediationsPerRound`; the record keeps the whole list), answering
with a change set against the best rather than a redraw — the elements it adds
or rewrites whole by id, the ids it removes, the lists it rewrites as they
should read — keeping every author id and prefixing what it adds with `ai-`;
why a change set, measured, is in `docs/quality-loop/orchestrators.md` under
"Is the coach applying the fixes?". Reading the run
(`GET /sessions/:id/improve/:runId`) resolves it through the `coaching_run`
row (an adopting run has no revision at `(runId, 1)`) and imports every
iteration whose score beat all before it as an `assistant` revision
`(runId, k)`, once — the unique pair on the row makes a concurrent poll
harmless — after parsing its artifact with the same schema and validators a
submission passes. Every iteration is reported with its score, decision, the
controller's reason, what settled the decision as data, and an outcome:
`base`, `imported`, `not-better`, `refused` with the problems the studio
found (logged, never repaired, never stored), or — for an iteration that
earned no score, which is compared with nothing — `unassessed` when the
lenses assessed too little of it and `no-artifact` when the coach produced
nothing. A failed run marks the base revision failed only when the base is
its own — an adopted base keeps the grade of the run it came from.

---

## 5. Where the model is called

Nowhere in the studio. `studio-ui` depends on `contracts`, `design-system` and
the web kits; `studio-api` on `contracts`, `db` and `nest-kit` — neither may
import `@sysdesign/llm`
(`tooling/code-review/rules/boundaries.ts`). The one seam is the
`QualityLoopClient` port (`packages/studio-api/src/modules/quality-loop/`),
an abstract class with one HTTP adapter that maps the loop's failures to
`502` / `503` / `504`, a fake bound in the API's specs, and a stub server the
e2e suite starts on `:3103` (a lane's own port on a `sysdesign_test_<lane>`) — both over the one `FakeLoop` in
`packages/studio-testing`. Availability is a proxy of the loop's own
(`GET /grading/availability`): a booted loop always has a model, so the
answer names it or is 503 because the loop is unreachable, and the UI
disables a control with that reason instead of failing.

Every model call lives in `packages/quality-loop`: the derive stage, the
producer, and each lens sample, all through `@sysdesign/llm`'s one port on
the Claude Code subscription login (a machine `claude login`, or
`CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token` where there is none; no
login, and the process refuses to boot). An API key is never used.

---

## 6. What is shared

| Component                                                                                        | Lives in                                         | Used by                                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------- |
| `designSubmissionSchema` and its parts; `designPromptDraftSchema` + `renderDesignPromptMarkdown` | `packages/contracts/src/lib/*.schema.ts`         | studio-api validation, the loop's artifacts, the UI's store   |
| `validateGraphReferences`, `validateBriefReferences`, `validateNarration`                        | `packages/contracts/src/lib/*-validator.ts`      | studio-api submit and import; the canvas pipeline's validator |
| `renderNodeLine`, `renderEdgeLine`                                                               | `packages/contracts/src/lib/graph-render.ts`     | the canvas pipeline's render                                  |
| The quality-loop wire types (`QualityRunDto`, `SuccessCriterion`, `ConfirmedFinding`, …)         | `packages/contracts/src/lib/quality-loop/`       | the loop, studio-api's client and mapper, both web clients    |
| `CANVAS_PIPELINE_ID`, `PROMPT_PIPELINE_ID`                                                       | `packages/contracts/src/lib/studio-pipelines.ts` | the pipeline definitions, studio-api, the e2e stub            |
| `createRevision`                                                                                 | `packages/db/src/revision-factory.ts`            | submit, coach start, coach import                             |
| `ZodValidationPipe`, `DbModule`, `HealthController`, `configureCors`                             | `packages/nest-kit`                              | studio-api, quality-loop, govcon                              |
| `pageFields`, `page`, `escapeLike`                                                               | `packages/nest-kit`                              | the list and search routes of the three APIs                  |
| `CRITERIA` registry (`[DEL-n]`, `[EVAL-n]`, `[GEN-n]`, `[UX-n]`, `[QL-n]` ids tests claim)       | `packages/criteria/src/index.ts`                 | test suites across every pipeline                             |

---

## 7. Which switches gate what

| Switch                            | Effect                                                                                                                     |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `config/engine.json`              | names the file under `config/llm/` that chooses the provider and model; absent, the Claude Code subscription               |
| a Claude Code login               | what the `claude-subscription` provider grades through — this machine's `claude login`; nothing to export                  |
| an `openai-compatible` config     | `baseUrl` plus the key named by `apiKeyVar` (never the key itself); covers the OpenAI API and any local server serving it  |
| `CLAUDE_CODE_OAUTH_TOKEN`         | the login where there is none (a Tilt/Kubernetes pod): the token `claude setup-token` prints, from `.env` or the shell     |
| no usable provider                | `serve` and `run` exit 1 at boot saying how to fix it; `replay` boots without a model. No switch runs the loop without one |
| `QUALITY_LOOP_URL`                | where studio-api finds the loop; default `http://localhost:3003`                                                           |
| `QUALITY_LOOP_RUN_STALE_AFTER_MS` | how long a running row may go without a heartbeat before the janitor fails it; default `180000`                            |
| `QUALITY_LOOP_DUMP_DIR`           | where the loop's run dumps go; default `static/runs`; the specs point it at a temp directory                               |

---

## 8. The quality loop itself

`packages/quality-loop` runs the generic doctrine from
[`../pipeline-best-practices/overview.md`](../pipeline-best-practices/overview.md)
over any task declared as data. Sixteen pipelines live as sibling folders
under `src/pipelines/`: `system-design`, `agentic-design` and
`memory-architecture` judge a text brief; `memory-recall` and
`experience-digest` are the memory tier's, composed by
`POST /orchestrations/memory` so a run can recall what earlier runs learned
and digest what it learned itself, and `knowledge-digest` is composed from a
finished run by the knowledge and memory-design orchestrators;
`system-design-canvas`, `design-prompt` and `interview-turn` are the studio's; `browser-step`,
`field-answer` and `answer-suggestions` are the browser session's, `tool-step`
a tool session's, `document-digest` the document ingester's and the browser
session's, `register-digest` a memory space's, and `introduction-note` govcon's —
a note to a prime about one tracked award, composed from the award's record and
the profile's offers. Each of those thirteen takes
a goal its owner composed — never a brief a person types into the router.
Every definition says which it is: `goalSource: 'brief' | 'composed'`,
validated at boot and carried on the pipeline summary, so the loop UI offers
only `brief` pipelines, the router never routes to a composed one, and no
orchestrator takes one as a target but `form-memory`, whose target is the form
pipeline its goal was composed for. It has its own Postgres tables
(`quality_run` and its children, `orchestration_run` and its children,
`memory_embedding`) and its own vector store (Qdrant, the
`vectors` compose service); the dump remains the full audit trail beside them.

A run may adopt a recorded iteration of an earlier run:
`POST /runs { adopt: { runId, iteration }, criteria, … }`, exclusive with
`output`. The adopted run must be the same pipeline at the same version and
the rubric must equal the one it was judged against; the iteration is copied
verbatim as iteration 1 in mode `adopted`, no stage runs for it, and the
record says which run it came from. A running row heartbeats, and the served
loop's janitor fails only rows whose heartbeat went stale; a swept row is
reclaimed by its owner's late close, so the record ends in the truth.

The controller that turns a ledger into a decision is declared per pipeline,
by reference, from a small library under `src/core/controllers/`: `standard`
(the doctrine's ordered gates, thresholds and route) and `dimension-floor`
(the same with a floor under every assessed dimension). Both are pure
functions of the ledger, so `main.js replay --pipeline <id>` compares them on
every recorded run without a model call (`./memory-runs.md` §13).

How the loop works, its env variables and its guarantees:
[`../pipeline-best-practices/quality-loop.md`](../pipeline-best-practices/quality-loop.md).
How the memory pipelines compose, how to operate them, and what the recent
runs showed: [`./memory-runs.md`](./memory-runs.md).
