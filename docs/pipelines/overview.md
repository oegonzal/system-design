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
   categories and ordinals locked to the ids on the page, two samples must
   agree, and the loop's deterministic controller prices and decides. What the
   studio shows is the decision and its trace.

---

## 1. The studio's three paths, at a glance

| #   | Path              | Trigger                                                                         | Pipeline               | Iterations           | What the studio stores                                                              |
| --- | ----------------- | ------------------------------------------------------------------------------- | ---------------------- | -------------------- | ----------------------------------------------------------------------------------- |
| 1   | Prompt generation | `POST /prompts/generate` → 202; `GET /prompts/generate/:runId` claims the draft | `design-prompt`        | 2                    | a `prompt_generation` row keyed by the run; the claimed `prompt`                    |
| 2   | Grade             | `POST /sessions/:id/revisions` → 201; `GET /revisions/:id/evaluation` polls     | `system-design-canvas` | 1                    | the revision, pointing at `(runId, 1)`; the terminal score and decision, cached     |
| 3   | Coach             | `POST /sessions/:id/improve` → 202; `GET /sessions/:id/improve/:runId` imports  | `system-design-canvas` | `maxIterations` ≤ 10 | the draft as revision `(runId, 1)`; every strictly better iteration as `(runId, k)` |

Beside them, without a run: `POST /prompts` stores markdown the author wrote,
`POST /prompts/import` copies a document from the loop's library, and both —
like every prompt the first time it is read — derive their criteria through
`POST /criteria`, one model call and no run.

```
studio-ui ──HTTP──► studio-api ──── QualityLoopClient (port) ──► quality-loop :3003 ──► Postgres
                       │                                              │                  quality_run*
   prompt (write/import/generate) ─ POST /criteria ─────────────────►│ derive stage
   (1) generate ─────── POST /runs { design-prompt, goal: experience }►│ writer → critics → evaluator → controller
   (2) submit ────────── POST /runs { system-design-canvas, output, criteria, 1 }
   (3) coach ─────────── POST /runs { system-design-canvas, output, criteria, n }
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
  experience (title, company label, summary, stack, highlights — the label is
  there so the fidelity critic can catch it leaking) as the goal of a
  `design-prompt` run and remembers the run in `prompt_generation`. Reading
  the run once it is complete parses its best artifact with
  `designPromptDraftSchema`, renders it to the house markdown with
  `renderDesignPromptMarkdown`, and claims it into a prompt with a
  conditional update, so two concurrent polls create one prompt. Omitting the
  experience picks the least practised one.

Criteria are `c1…cN` with kinds `functional`, `non_functional`, `scale`,
`constraint`; they are stable for the prompt's life and can be re-derived
(`POST /prompts/:id/criteria`) only while no session has been graded against
them. A rewrite of the markdown clears and re-derives them under the same
rule.

---

## 3. Grade

`packages/studio-api/src/modules/sessions/`. Submitting a revision:

1. **Validate structure.** Shape errors from `designSubmissionSchema` are
   `400`; referential problems are one `422` listing every one — an edge to a
   node that is not there, a carry neither endpoint declares, a binding to a
   criterion the prompt never derived or a node the canvas does not hold, a
   path that does not connect, a rationale for a node that is not drawn
   (`submission.ts`). Nothing here says whether the design is any good.
2. **Start the run before writing.** `startRun({ pipeline: 'system-design-canvas',
goal: prompt.markdown, output: { graph, brief, narrative }, criteria:
prompt.criteria, maxIterations: 1 })`; a loop that refuses leaves no
   half-graded row behind.
3. **Store the revision** pointing at iteration 1 of that run
   (`createRevision`, one transaction, dense numbering).
4. **Read the grade back.** `GET /revisions/:id/evaluation` fetches the run
   and maps its iteration (`evaluation.mapper.ts`): score, decision and
   dimensions from the controller; findings from the ledger with `node.N` /
   `edge.N` refs resolved by position onto the graded graph and the lens's
   rationale beside them; a result per criterion. The terminal score, decision
   and status are written back onto the revision so lists and timelines never
   fetch the loop.

Inside the run, the canvas pipeline's `references` validator repeats the
studio's three checks (so what the studio refuses and what the loop blocks
cannot differ), five critics — requirements, architecture, capacity,
explanation, failure scenarios — and two evaluators judge with two samples
each, and the standard controller decides.

---

## 4. Coach

The same run with more iterations. `POST /sessions/:id/improve` validates the
draft exactly as a submission, starts the run with `maxIterations`
(default 3, at most 10), and stores the draft as the author's own revision
`(runId, 1)`. From iteration 2 on the loop's producer — the canvas pipeline's
coach persona — revises against the remediations the controller selected,
keeping every author id and prefixing what it adds with `ai-`. Reading the run
(`GET /sessions/:id/improve/:runId`) imports every iteration whose score beat
all before it as an `assistant` revision `(runId, k)`, once — the unique pair
on the row makes a concurrent poll harmless — after parsing its artifact with
the same schema and validators a submission passes; an artifact the studio
would refuse is logged and skipped. The response lists every iteration with
its score, decision and the revision it became, if any.

---

## 5. Where the model is called

Nowhere in the studio. `studio-ui` depends on `contracts`, `design-system` and
the web kits; `studio-api` on `contracts`, `db` and `nest-kit` — neither may
import `@sysdesign/llm`
(`tooling/code-review/rules/boundaries.ts`). The one seam is the
`QualityLoopClient` port (`packages/studio-api/src/modules/quality-loop/`),
an abstract class with one HTTP adapter that maps the loop's failures to
`502` / `503` / `504`, a fake bound in the API's specs, and a stub server the
e2e suite starts on `:3103`. Availability is a proxy of the loop's own
(`GET /grading/availability`), so the UI can disable a control with an
honest reason instead of failing.

Every model call lives in `packages/quality-loop`: the derive stage, the
producer, and each lens sample, all through `@sysdesign/llm`'s one port under
the loop's role (`QUALITY_LOOP_DETERMINISTIC` / `QUALITY_LOOP_AUTH` /
`ANTHROPIC_API_KEY`).

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
| `CRITERIA` registry (`[DEL-n]`, `[EVAL-n]`, `[GEN-n]`, `[UX-n]`, `[QL-n]` ids tests claim)       | `packages/criteria/src/index.ts`                 | test suites across every pipeline                             |

---

## 7. Which switches gate what

| Switch                          | Effect                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`             | the loop grades on the API; outranks the subscription route                                                  |
| `QUALITY_LOOP_AUTH=claude-code` | the loop grades through this machine's Claude Code login (the local stack's default)                         |
| `QUALITY_LOOP_DETERMINISTIC=1`  | no model at all: `POST /criteria` is 503, a run escalates with no score; what CI and the Tilt deployment set |
| `QUALITY_LOOP_URL`              | where studio-api finds the loop; default `http://localhost:3003`                                             |
| `LLM_MODEL`                     | the model id on either route                                                                                 |
| `EVAL_DUMP_DIR`                 | where the loop's run dumps go; the specs point it at a temp directory                                        |

---

## 8. The quality loop itself

`packages/quality-loop` runs the generic doctrine from
[`../pipeline-best-practices/overview.md`](../pipeline-best-practices/overview.md)
over any task declared as data. Six pipelines live as sibling folders under
`src/pipelines/`: `system-design` and `agentic-design` judge a text brief;
`memory-recall` and `experience-digest` are the memory tier's, composed by
`POST /orchestrations/memory` so a run can recall what earlier runs learned
and digest what it learned itself; `system-design-canvas` and
`design-prompt` are the studio's, and take a goal the studio composed — never
a brief a person types into the router. It has its own Postgres tables
(`quality_run` and its children, `orchestration_run` and its children,
`memory_embedding`) and its own vector store (Qdrant, the `vectors` compose
service); the dump remains the full audit trail beside them.

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
