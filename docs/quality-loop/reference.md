# `packages/quality-loop`, folder by folder

A reference for finding your way around the package: what each folder is for, what the files inside
it are called, and what they export.

The package is one generic quality-control loop — a producer makes an artifact, critics look for
defects, evaluators judge it against criteria, and a deterministic controller decides what happens
next. A pipeline is **data**: vocabularies, markdown personas, a decision policy, and one output
shape. When a model judges, it answers only in enumerated categories and ordinals — never a score —
so every number and the final decision belong to the policy. Every run writes a Postgres row and a
dump folder.

It is an Nx application, so there is no `package.json` and no barrel file to read. Its public surface
is the HTTP API on port 3003, two CLI commands, and the dump layout. To follow one debate between the
lenses — who is shown what, in which order, and where the engine decides — read
[`lens-debate.md`](lens-debate.md) beside this reference. `src/main.ts` picks one of three
modes from the first argument — `run`, `replay`, or anything else meaning serve — and `src/boot.ts`
refuses to start without a model login before Nest loads.

## The shape of a run

```text
  goal markdown        a prompt file, or a goal composed by pipelines/<id>/input.ts
        |
        v
  derive-criteria      core/stages/derive-criteria.ts        criteria c1..cN, ids assigned here
        |
        v
  producer             core/stages/llm-producer.ts           the artifact
        |              (or supplied, or adopted from an earlier run - no model call)
        v
  validators           core/stages/schema-validator.ts       always runs first
        |              + pipelines/<id>/validators.ts        a `block` failure skips every lens;
        |                                                    a `cut` refuses the positions it
        |                                                    names; a `warn` only informs
        v
  critics              core/stages/llm-critic.ts             findings: type, severity, confidence
  evaluators           core/stages/llm-evaluator.ts          pass | partial | fail | not_applicable
        |              Every critic, and every evaluator declaring consumes: [], runs in the
        |              first wave from the artifact alone. An evaluator declaring
        |              consumes: ['findings'] runs after the critics, shown only what the
        |              normaliser confirmed.
        v
  normalize            core/evidence/normalize.ts            the ledger: ids, enums and counts
        |              admits, keys structurally, confirms by agreement across samples
        v
  refound              the pipeline's refoundEvidence        optional: a fact the goal declares
        |              (browser-step only)                   corrects the ledger, each change
        |                                                    noted as a `refounded` diagnostic
        v
  controller           core/controllers/                     accept | revise | retry |
        |              scores first, then gates in a fixed order    escalate | reject
        |
        +-- revise --> back to the producer with the remediations, up to maxIterations
        |
        v
  the run closes       a Postgres row   modules/runs/persistence/
                       a dump folder    dump/ written to static/runs/<runId>/
```

## `src/` at a glance

| Folder           | What it is                                                                      |
| ---------------- | ------------------------------------------------------------------------------- |
| `core/`          | The engine. Pure: no Nest, no clock, no filesystem, no env vars, no randomness. |
| `pipelines/`     | The fourteen pipelines, one folder each, plus the registry.                     |
| `orchestrators/` | Compositions that run several pipelines in order, declared as data.             |
| `modules/`       | The NestJS layer: HTTP routes, Postgres, Qdrant, the model client.              |
| `cli/`           | The two command-line entry points, `run` and `replay`.                          |
| `dump/`          | The layout of a run's dump folder, built purely in memory.                      |
| `types/`         | One ambient declaration so a persona can be imported as `*.md?raw`.             |
| `boot.ts`        | `commandOf` picks the mode; `preflight` refuses to start without a model login. |
| `main.ts`        | Dispatches to the CLI or boots the HTTP app on `QUALITY_LOOP_PORT` (3003).      |

## `core/` — the engine

Everything here is pure. The clock arrives as an injected `now`, the model as a port. This is not a
convention: `tooling/quality-loop-guarantees.spec.ts` walks every non-spec file under `core/` and
fails the build on `Date.now`, `Math.random`, `node:fs` or `process.env`, on a number appearing in
the judging schemas under `core/stages/`, and on the normaliser or a controller touching prose.

### The six loose files

| File                   | What it does                                                            | Exports                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline.ts`          | Defines what a pipeline is — the declaration alone.                     | `PipelineDefinition`, `LensSpec`, `CriticSpec`, `EvaluatorSpec`, `ProducerSpec`, `StageSpec`                                                              |
| `validate-pipeline.ts` | Fails boot on a malformed declaration.                                  | `validatePipeline`                                                                                                                                        |
| `describe-pipeline.ts` | The serialisable summary `GET /pipelines` and the dump carry.           | `describePipeline`                                                                                                                                        |
| `policy.ts`            | Refuses a malformed decision policy before it can grade anything.       | `STANDARD_SCORING`, `validatePolicy`                                                                                                                      |
| `ports.ts`             | The interfaces the loop runs over — stages, stores, the run repository. | `Producer`, `Critic`, `Evaluator`, `CriteriaDeriver`, `Validator`, `Controller`, `Stages`, `TraceStore`, `ExchangeSink`, `RunRepository`, `emptyUpstream` |
| `arithmetic.ts`        | The three numeric idioms, so a replayed decision compares byte-equal.   | `sum`, `round1`, `round4`                                                                                                                                 |

`PipelineDefinition<T>` is the interface everything else is written against: `id`, `version`,
`description`, `goalSource`, `task` (criterion kinds, finding types, `maxCriteria`, any
`fixedCriteria` that head every rubric, the output shape), then `deriveCriteria`, `producer` (its
persona, what it `consumes`, and an optional `instruction` — the first-draft ask in the pipeline's
own terms), `validators`, `critics`, `evaluators`, `controller`, `policy`, and an optional
`refoundEvidence` pass that corrects the ledger from facts the goal declares.
Nothing outside a pipeline folder may import a concrete pipeline — the registry hands out
`PipelineDefinition<unknown>`.

`validatePipeline` runs at boot and again at every run: lens ids unique and not reserved, every
model-facing stage with a persona and a token cap, every criterion kind judged by exactly one
evaluator, no evaluator consuming findings with no critic before it, under `cited` corroboration no
evaluator of a gating kind reading the critics first (`checkCorroboration`), a valid controller
projection, and the output schema convertible to JSON Schema. `Controller.decide`
is synchronous by contract, which is how "the controller never awaits a model" is held by the type
rather than by review.

### `core/contracts/` — the vocabulary of a task

| File              | What it does                                                             | Exports                                                                                                     |
| ----------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `task.ts`         | The pipeline's code half: parse, address and render an artifact.         | `OutputShape`, `TaskSpec`, `TaskContract`                                                                   |
| `output-shape.ts` | The layout habits every output shape shares.                             | `numbered`, `section`, `numberedSection`                                                                    |
| `validation.ts`   | The shape of an exact check a pipeline brings: `block`, `cut` or `warn`. | `indexedValidator`, `asWarning`, `IndexedRule`, `problem`, `REFERENCES_VALIDATOR_ID`, `LIMITS_VALIDATOR_ID` |
| `run-record.ts`   | One run as the service holds it, and as the wire sees it.                | `RunRecord`, `toRunDto`, `summariseExchange`                                                                |

A validator reads the fenced index — the codec is `goal-index.ts` in `@sysdesign/contracts`, shared with every
composer — never prose, and reports nothing on a malformed artifact — the schema validator owns that report. No model reads the index: `goalSection` in `core/stages/prompting.ts`
shows every stage the goal without its index section (`stripIndexSection` in `@sysdesign/contracts`), so a
prompt carries the task alone while the validators read the goal as stored.

### `core/controllers/` — the deterministic decider

| File                 | What it does                                                 | Exports                                                                                                                           |
| -------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `context.ts`         | Prices the ledger once into the context every gate reads.    | `buildContext`, `GateContext`, `Scored`                                                                                           |
| `compose.ts`         | Turns ordered gates plus one route into a controller.        | `composeController`, `Gate`, `Route`, `Verdict`, `Settled`, `ControllerParts`, `projectStep`, `SCORES_FACTOR`                     |
| `gates.ts`           | The six standard gates and the standard route.               | `artifact`, `validators`, `evidence`, `policyAllowed`, `acceptThreshold`, `rejectFloor`, `byRemediations`, `settleByRemediations` |
| `dimension-floor.ts` | Keeps an artifact in the loop when one dimension is failing. | `dimensionFloor`, `DIMENSION_FLOOR_FACTOR`                                                                                        |
| `index.ts`           | The named strategies, and the registry `replay` compares.    | `STANDARD`, `DIMENSION_FLOOR`, `CONTROLLERS`                                                                                      |

A gate observes the context and gives a verdict; it never edits it. `composeController` validates at
module load, so a malformed composition fails at boot.

### `core/evidence/` — reports become a ledger

| File           | What it does                                                             | Exports                                                                                            |
| -------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `ordering.ts`  | Stable orderings and the conservative median.                            | `medianLevel`, `compareFindings`, `compareStrings`, `severityRank`, `unique`, the four rank tables |
| `identity.ts`  | Decides what counts as the same defect — structurally, never by wording. | `findingKey`, `sameDefect`, `admitRefs`                                                            |
| `normalize.ts` | Admits, keys, confirms by agreement, merges by median, reconciles.       | `normalize`, `NormalizeInput`                                                                      |
| `annotate.ts`  | Attaches prose after the fact, for readers and the producer.             | `annotate`, `noteRemediations`, `unannotated`                                                      |
| `lessons.ts`   | What the run taught across its iterations.                               | `deriveLessons`                                                                                    |

`normalize.ts` is the tier boundary: a second-wave evaluator sees only what was confirmed, never a
raw report. The evaluator's advisory verdict is recorded and goes no further, so flipping it cannot move
a decision.

### `core/loop/` — the iteration engine

| File              | What it does                                                                          | Exports                                                              |
| ----------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `run-pipeline.ts` | The loop: produce or adopt, validate, judge, normalise, decide, repeat.               | `runPipeline`, `runLoop`, `RunInput`, `RunDeps`, `IterationListener` |
| `iteration.ts`    | One iteration as named steps: produce or adopt, validate, judge, decide.              | `runIteration`                                                       |
| `briefing.ts`     | What the next ask is told about the attempt before: refusals and setbacks.            | `refusalsOf`, `setbacksOf`, `lostProduce`, `wasBlocked`              |
| `waves.ts`        | The critics, then any evaluator that consumes their findings; the normaliser between. | `runLensWaves`, `Judged`                                             |
| `materialize.ts`  | Definition plus model client becomes concrete stages.                                 | `materialize`, `materializeCriteria`                                 |
| `rubric.ts`       | Checks a supplied rubric could have been derived, before any row.                     | `rubricProblems`                                                     |
| `scoped-llm.ts`   | The recording twin of the model client, plus bounded concurrency.                     | `scopeLlm`, `mapConcurrent`                                          |

A new iteration has to be strictly better to be crowned. An adopted iteration is cloned and runs no
stage. The output shape's `normalize` is applied only to a produced artifact, never to a supplied
one. How a host hooks into the loop — `RunDeps.onIteration` and the exchange sink, the recorder,
heartbeat and janitor around them, and where the bus events are — is walked in
[`lifecycle-and-hooks.md`](lifecycle-and-hooks.md).

### `core/outputs/` — reading a finished run

| File                   | What it does                                                                                   | Exports                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `run-outputs.ts`       | The standard projections: best iteration, artifact, ledger, lessons.                           | `outputsOf`, `admits`, `RunOutputs`                                                                               |
| `reconcile.ts`         | Where several runs agreed and where they did not.                                              | `reconcile`, `spread`                                                                                             |
| `withheld.ts`          | What a reader of a run withholds of the items it draws on, by the rules the pipeline declares. | `withheldOf`, `withheldItems`, `withholdingOf`, `WithheldItem`                                                    |
| `experience-record.ts` | A finished run reduced to the facts a digest reasons over, and fitted to a goal budget.        | `experienceOf`, `trimExperience`, `fitToBudget`, `teachesNothingNew`, `Experience`, the record's schemas and caps |

Everything downstream reads a finished run through here and never re-derives "the best iteration".
`reconcile` reports disagreement and never judges it — a threshold would be policy, and policy lives
on a pipeline.

### `core/stages/` — the only folder that talks to a model

| File                  | What it does                                                  | Exports                                                                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared.ts`           | Stage names, diagnostics, one sample per scoped client.       | `CRITERIA_STAGE`, `PRODUCER_STAGE`, `LENSES_STAGE`, `REFOUND_STAGE`, `diagnostic`, `stageDiagnostic`, `failedDiagnostic`, `overrunDiagnostic`, `skipped`, `sampleUnits`, `planned`                      |
| `prompting.ts`        | The engine's half of every prompt, section by section.        | `systemPrompt`, `goalSection`, `kindsSection`, `typesSection`, `criteriaSection`, `artifactSection`, `locationsSection`, `validationSection`, `remediationsSection`, `upstreamSections`, `joinSections` |
| `schemas.ts`          | The only zod a model sees, built per request over real ids.   | `criteriaSchema`, `findingsSchema`, `evaluationSchema`, `enumTuple`                                                                                                                                     |
| `derive-criteria.ts`  | One structured extraction of criteria from the goal.          | `createCriteriaDeriver`                                                                                                                                                                                 |
| `llm-producer.ts`     | The generator. Sees criteria and remediations, never a score. | `createLlmProducer`                                                                                                                                                                                     |
| `llm-critic.ts`       | The defect-oriented lens, enum-locked.                        | `createLlmCritic`                                                                                                                                                                                       |
| `llm-evaluator.ts`    | The criteria-oriented lens.                                   | `createLlmEvaluator`                                                                                                                                                                                    |
| `schema-validator.ts` | The one validator every pipeline runs first.                  | `createSchemaValidator`                                                                                                                                                                                 |

The goal reaches the model through `goalSection` and nowhere else. A failed completion becomes a
diagnostic, never evidence.

### `core/testing/` — shared spec builders

| File          | What it does                                                    | Exports                                                                                                                                     |
| ------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `llm.ts`      | Fake model clients that answer by schema match.                 | `fakeLlm`, `sequencedLlm`, `gatedLlm`                                                                                                       |
| `pipeline.ts` | The tiny pipeline, the standing proof the core assumes nothing. | `tinyPipeline`, `tinyPolicy`, `scriptedProducer`, `scriptedCritic`, `scriptedEvaluator`, `scriptedStages`, `criterion`, `finding`, `result` |
| `trace.ts`    | Builders for ledgers, decisions, traces and run records.        | `ledger`, `decision`, `traceOf`, `runDto`, `runRecord`, `evidence`, `confirmed`                                                             |
| `fixtures.ts` | Small shared builders.                                          | `fill`, `contractOf`, `jsonSchemaTypes`                                                                                                     |

These are pure and import nothing from vitest, so they compile under the app tsconfig even though
only specs use them.

## `pipelines/` — the fourteen pipelines

### The folder layout, once

Every pipeline is `src/pipelines/<id>/` and repeats the same shape.

| File                 | Always   | What it is                                                                               |
| -------------------- | -------- | ---------------------------------------------------------------------------------------- |
| `definition.ts`      | yes      | The exported `PipelineDefinition`. Pure data apart from its imports.                     |
| `lenses/*.md`        | yes      | One markdown persona per stage, imported `?raw`. The filename is the lens id.            |
| `output.ts`          | yes      | The output shape: a zod schema, `locate` for positional ids, `render`.                   |
| `definition.spec.ts` | yes      | Validity, a JSON-round-trippable summary, personas long enough to be real.               |
| `input.ts`           | 9 of 14  | A codec, when the goal is more than a prompt. Renders a typed input to markdown.         |
| `validators.ts`      | 12 of 14 | Deterministic checks, each gating `block`, `cut` or `warn`. Never read prose.            |
| `testing.ts`         | 11 of 14 | Pure sample builders shared by the folder's specs.                                       |
| `run.spec.ts`        | 10 of 14 | An end-to-end loop spec over a fake model.                                               |
| `controller.ts`      | 1 of 14  | Only when the pipeline has a decision rule of its own (`system-design-canvas`).          |
| `from-run.ts`        | 2 of 14  | A finished run becomes the next pipeline's input (the experience and knowledge digests). |
| `refound.ts`         | 1 of 14  | Only `browser-step`: the pipeline's `refoundEvidence` pass.                              |

### The fourteen

**`system-design/`** — produces a structured design answer (summary, assumptions, components, flows,
data model, tradeoffs, risks, capacity) from a markdown prompt, for a person practising. Four
criterion kinds, seven finding types. Three critics and two evaluators, all in one wave. Dimensions:
completeness, quality attributes, compliance, soundness. Standard controller, no validators, accept
at 80 — the highest in the package.

**`agentic-design/`** — produces a design for a workflow of agents, tools and rules. Four critics in
wave one, three evaluators in wave two, every one of them sampled twice. Its producer deliberately
does _not_ see the criteria. Every declared dimension earns from a criterion kind, which its spec
asserts. The clean two-wave example.

**`memory-architecture/`** — produces and coaches a strategy for an agentic-memory system from a
brief: the registers it keeps (working, episodic, semantic, procedural, relational, each short- or
long-term), the typed interfaces over them and the workflows whose steps name a declared operation.
Its sibling is `agentic-design`, not the canvas pipeline. Six critics and two evaluators, six
dimensions with `lifecycle` among them, the `STANDARD` controller. The strategy's schema and its
reference rule live in contracts, because the agentic-memory runtime executes the same strategy; the
pipeline keeps where a judge finds each part, a coverage warning of its own, and an `executability`
warning that runs the runtime's own analysis (`analyzeStrategy`) over every draft, so the coach is told
what would not run.

**`memory-recall/`** — produces a memory pack: a verdict on each recalled chunk, the insight each
kept chunk lends, and the needs nothing served. Written for the next producer in a memory
orchestration, never for a person. Uses the `DIMENSION_FLOOR` controller, the only non-standard
library controller in use, and two blocking validators built from the goal's fenced index.

**`experience-digest/`** — produces the memories a finished run is worth, each resting on cited
evidence. Three critics, one evaluator judging both kinds. Its `from-run.ts` composes the input from
engine facts only — confirmed findings, selected remediations, per-iteration decisions — so nothing
is judged there.

**`system-design-canvas/`** — judges or coaches the author's React-Flow graph, the brief binding each
criterion to the parts holding it, and the narrative. This is the grade a user sees in the studio.
The largest vocabulary, ten criterion kinds, sixteen finding types, five critics, four evaluators.
Its own controller, `REVISE_ONLY`, which
no path can make decide `retry` — a retry would replace the author's canvas with the model's.

**`design-prompt/`** — produces a practice prompt from an engineer's experience: title, scenario,
functional requirements, the data owned, the interfaces exposed, a quality-target table (figures
optional), a scale table only where load shaped the system, the decisions to make, constraints. The smallest pipeline — two
critics, one evaluator, one sample each, and one validator, which only warns. Its gated finding is
`brand_leak`, the one defect no score can offset.

**`browser-step/`** — produces one plan for the page in front of a browser session: an assessment
and the actions up to the next page transition. Its goal is composed by the session (mission, page,
elements, snapshot, recent actions, units of work, limits, index); two `cut` validators read the
index, so a fault refuses only the actions from it on. Two critics and one evaluator, one sample
each, all in one wave: under `cited` corroboration a finding vetoes only when the evaluator, reading
the page apart, failed a gating criterion it cites. The only pipeline that declares a refound pass.
[`lens-debate.md`](lens-debate.md) walks one of its steps end to end; how a fact from outside the
session — a unit a domain's record forbids — reaches those validators and comes back as an event:
[`domain-rules.md`](domain-rules.md).

**`tool-step/`** — produces one plan of tool calls for the state in front of a tool session: an
assessment and the calls up to the first whose outcome must be seen, or the one question the
session puts to its operator, or the finish on a declared stop cause. The generalisation of
`browser-step` over whatever tools a program declares — a mailbox's, a calendar's — none of which
the pipeline names: its goal is composed by the session (mission, tools, observations, recent
calls, objections, progress, limits, index), the tools' parameters travel as JSON schema in the
index and a call's arguments as one JSON object in a string, and two `cut` validators hold a plan
to the index — a listed tool, arguments that fit, nothing after an irreversible or approval-gated
call, a finish on a declared cause once something was observed. The same two critics, one
evaluator and cited corroboration as `browser-step`, with caps seeded from its measurements until
a tool-step run is recorded. The read-back both share lives in the contracts
(`lib/quality-loop/read-back.ts`).

**`field-answer/`** — answers every field of one form page about the session's subject from the
evidence the goal lists, routing a field no evidence settles to the operator. A `block` references
validator and a `warn` limits validator; its evaluator runs after the critics, shown what they
confirmed. The only gated type is a trap answered.

**`answer-suggestions/`** — drafts a few suggested answers for each field of one form page the
operator is about to be asked: from the record the goal lists about the subject, or, where the
record is silent and the goal's suggesting policy allows, drafts labelled as drafts. Its goal is the
form codec's, composed for this pipeline, and it runs as the form-memory orchestrator's other
target. Four criteria head every rubric; two critics and one evaluator beside them, one sample each,
one iteration — the operator waits on it — and a faulted suggestion is withheld from the operator
rather than revised. A `block` references validator and two `warn` ones, citations and limits.

**`document-digest/`** — digests one chunk of a document — a résumé page, a notes file, the
operator's answers from a session — into facts in the store's own item shape, each resting on the
sections that state it. Three critics and two evaluators, every lens sampled twice.

**`knowledge-digest/`** — digests a finished run into typed knowledge — a fact, an anti-pattern, a
pattern, a procedure — written against what the store already knows. Its `from-run.ts` composes the
input from engine facts. Three critics and two evaluators, every lens sampled twice; two validators
read its index, and three warnings withhold or keep an item as each declares.

**`register-digest/`** — digests one text a program hands to a memory space — a conversation, a
passage, a tool's result — into typed memories, each filed under a register the space lets a writer
remember into and resting on the sections that state it. Its goal is composed by the space's host
with the contracts codec (`renderRegisterDigestGoal`): every part quoted under its `section.N` alias
with the label and time the text's owner declared, then the registers — what each holds, the fields
it reconciles on, the identities it keeps reserved — the caller's rules, the limits, and an index
that alone carries the space, the scope and the provenance. A memory fills one of five nullable kind
slots, each the agentic-memory runtime's own candidate schema with its valid time relaxed to
nullable text. Three dimensions — coverage, fidelity, filing — each earned by a kind, with the
grounding, filing and safeguard rules fixed on every rubric; three critics own the eight finding
types and two evaluators judge beside them, every lens sampled twice. Its four validators only warn,
each withholding the one memory it faults, never the digest. Its caps are seeded from
`document-digest`'s measurements until its own `measured.json` records runs. The `register-memory`
orchestrator runs it and reports what the space may write.

### The registry

`pipelines/index.ts` imports the fourteen definitions, erases their type parameter and exports `PIPELINES`
keyed by id. Exactly one place consumes it: `modules/runs/pipelines.module.ts`, which provides it as
`PIPELINES_TOKEN`. Adding a pipeline is a folder, one line in `index.ts`, and one line in the ordered
list in `index.spec.ts`. Nothing in `core/` changes.

## `modules/` — the NestJS layer

### `modules/app/`

Boots and configures the served application. `AppModule` imports the database, janitor, runs,
prompts, memory, router and orchestration modules. `HealthController` answers `GET /health` with the
bound model, so reaching it proves a model is wired. `configure-app.ts` exports `configureApp` and
`CORS_ORIGIN`, used by `main.ts` and by the HTTP specs so they boot identically. `ReplayModule` is
the slim context for the replay command: database and pipelines only, no model, no janitor.

### `modules/http/`

Three helpers the controllers share, no Nest module: `orNotFound` for 404s, `goalRequestSchema` with
`MAX_GOAL_LENGTH`, and `testing.ts`, the integration harness whose defaults force a fake model, a
disabled embedding client and an in-memory store so a developer's `.env` can never make a suite call
a real provider.

### `modules/janitor/`

One sweeper. `RunJanitor` sweeps at boot and then on an interval, failing rows whose heartbeat went
stale. `stale-after.ts` exports `runStaleAfterMs` — the one strict env validator in the package,
rejecting anything but a positive integer for `QUALITY_LOOP_RUN_STALE_AFTER_MS`, default three minutes.
Token: `RUN_JANITOR_OPTIONS`. A failed row is written `INTERRUPTED`; a late close on such a row
overwrites it with the truth. The heartbeat is on the wire as `heartbeatAt` on a run and its list
row — refreshed on every write and on the ticker while it runs, settled to the finish once it has —
so a reader can tell a live run from a killed one still saying `running` before the sweep does.

### `modules/memory/`

Owns the memory tier's adapters. Tokens: `EMBEDDING_CLIENT`, `EMBEDDING_CACHE`, `MEMORY_STORE`,
`QUERY_PROBES`, `MEMORY_SUPPORT`, `MEMORY_PORTS`, `KNOWLEDGE_PORTS`.

| File                                       | What it does                                                       |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `qdrant/qdrant-memory-store.ts`            | The vector store adapter.                                          |
| `qdrant/collection.ts`                     | Collection naming by model, width and index generation; payloads.  |
| `persistence/mikro-orm-embedding-cache.ts` | Caches embeddings by model and content hash.                       |
| `persistence/mikro-orm-memory-support.ts`  | Which run confirmed or contradicted which stored item.             |
| `query-probes/llm-query-probes.ts`         | Turns a goal into retrieval probes with one structured model call. |
| `reports/effectiveness.ts`                 | Did a recalled lesson's run see its defects resolve.               |
| `reports/gaps.ts`                          | What no recall could serve, by brief.                              |
| `memory.service.ts`                        | Re-index, retraction by run or by point, and the four reports.     |

`KNOWLEDGE_PORTS` is the same embeddings and store object the memory ports hold, plus the support
store: one adapter set, two port shapes, because `support` belongs to one orchestrator and widening
`MemoryPorts` would reach every fake of it.

Seven routes. `POST /memory/:id/reindex` re-embeds a finished memory run's lessons. `DELETE /memory/:id`
retracts every point a digest run stored, for a document taught or ingested again;
`DELETE /memory/:id/points/:ref` retracts one stored memory, for a fact since corrected, by the run it
was digested from (the digest run only for a document's digest) and its ref, and answers the text,
kind and scope it held — the only record of it once the point is gone; under `points`, an empty ref
matches no route rather than the run's own address. No retraction is recorded, so a re-index of a
memory run stores again a lesson retracted from it.
`POST /memory/form-retrieval-report` answers what a form page's recall would retrieve for a list of
fields under the unit of work the body names (`unitKey`; absent, the memories bound to a unit are
read for none, as a page naming none reads them) — each field's probe, both named vectors' rankings
with cosines, its fused list and the dealt evidence, every hit with the kind, scope and unit the
store holds it under — the form path's own measurement seam, as `retrieval-report` is the curated
path's.
`POST /memory/retrieval-report` shows store availability, each probe's own ranking and the fused
candidate list, without running a pipeline. `GET /memory/effectiveness` joins each recalling run's
lessons to what the engine said changed in its next iteration — attributed at run level, which the
DTO states, because the curator names what a lesson serves in prose. `GET /memory/gaps` keeps the
needs no recall could serve, grouped by the brief taken bare. Both reports read records and write
nothing. Without an OpenAI key the tier degrades to disabled rather than failing.

### `modules/orchestration/`

Runs and records orchestrations. Tokens: `ORCHESTRATOR_HOSTS`, `ORCHESTRATION_RUN_REPOSITORY`.
`ORCHESTRATOR_HOSTS` is the only place a declaration meets its adapters. `OrchestrationService`
admits a request, resolves the iteration budget, starts a heartbeat and drives the generic runner.
`OrchestrationRecordModule` is the record alone, so the janitor and the memory module can import it
without pulling in the hosts.

Routes: `POST /orchestrations/:orchestrator` and `POST /orchestrations/:orchestrator/from-run` both
answer 202; `GET /orchestrations` is a filtered page; `GET /orchestrations/:id` returns one, its
steps put back into declaration order.

### `modules/prompts/`

Serves the markdown prompt library the UI picks goals from. `FilePromptLibrary` walks the prompts
directory on every request; the id is the path without `.md`, the title the first heading. Token:
`PROMPT_LIBRARY`. Routes: `GET /prompts` and `GET /prompts/*id`. Touches the filesystem only.

### `modules/router/`

The brief classifier and the no-run report. `LlmBriefClassifier` makes one structured call with its
choices locked to the registered route ids and returns null on any failure. Tokens:
`BRIEF_CLASSIFIER`, `ROUTER_PORTS`. Route: `POST /router/report` returns the candidate routes, the
pipeline that would be chosen, and why — without running anything.

### `modules/runs/`

The core of the service. Tokens: `QUALITY_LOOP_LLM`, `PIPELINES_TOKEN`, `TRACE_STORE`,
`RUN_REPOSITORY`.

| File                      | What it does                                                               |
| ------------------------- | -------------------------------------------------------------------------- |
| `runs.service.ts`         | Starts and runs a run; `run-recorder.ts` writes what it did and closes it. |
| `runs.controller.ts`      | `POST /runs` (202), `GET /runs`, `GET /runs/:id`, `POST /runs/evidence`.   |
| `pipelines.controller.ts` | `GET /pipelines` — the registry as summaries.                              |
| `criteria.controller.ts`  | `POST /criteria` — one model call, no row, no dump.                        |
| `run-request.ts`          | The request schemas, including the adopt and output rules.                 |
| `dump-trace-store.ts`     | The one dump writer. Never throws; a failed write is logged.               |
| `persistence/*`           | Row types, `toRows`, `fromRows`, `toSummary`, the MikroORM repository.     |

A run opens as a `running` header with a heartbeat, records each model exchange as it goes, and
closes in a single pessimistic-write transaction that inserts every criterion, iteration, finding and
result. So a run is either fully recorded or still running for the janitor to reclaim. Mapping is
pure and round-trips. Reading a finished run goes through `core/outputs/`.

## `orchestrators/` — compositions over pipelines

An orchestrator is data: which pipelines run, in what order, what each step needs from the ones
before it, and the closed set of reasons its steps may give. One generic runner executes any of them.
`index.ts` exports `ORCHESTRATORS`; `common.ts` holds what more than one of them declares —
`refuseInternal`, `bareRequest`, `runTarget`, `briefRoutes`, and `UNADMITTED_REASON`, the reason a
memory step gives for a child it may not draw on — none of which the runner applies.

### The shared machinery

**`runner/`** is not an orchestrator but the engine that executes one. `definition.ts` is the data
model (`OrchestratorStep`, `OrchestratorDefinition`, `validateOrchestrator`), `run-orchestration.ts`
the single loop, `record.ts` and `ledger.ts` the step record that is written whole at the end. A step
can only run a pipeline it declared, and an undeclared reason is rejected.

**`panel/`** is the two step factories the two panel orchestrators share: `panelStep` runs a pipeline
several times over, `reconcileStep` reads those runs and reports where they disagree.

### Each one

| Orchestrator      | Steps                         | Run it when                                                                              |
| ----------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| `memory`          | recall, target, digest, store | You want a run to benefit from, and contribute to, what earlier runs learned.            |
| `knowledge`       | target, known, digest, store  | You want a finished run turned into typed knowledge, against what is known.              |
| `router`          | classify, judge               | You have a brief and do not want to choose the pipeline yourself.                        |
| `calibration`     | panel, reconcile              | You want to measure end-to-end variance before trusting a score.                         |
| `second-opinion`  | first, panel, reconcile       | You want to judge one fixed artifact again and see where the judges disagree.            |
| `form-memory`     | recall, target                | A form page needs the subject's facts before it is answered.                             |
| `document-memory` | digest, store                 | A document chunk should become facts about its subject.                                  |
| `memory-design`   | target, known, digest, store  | A finished memory-architecture design run should be learned from, against what is known. |
| `register-memory` | digest                        | A text handed to a memory space should become the typed memories its registers keep.     |

`memory/` and `knowledge/` are the largest. In `memory/`, `recall/` builds the query, fuses the hits
and injects what the recall run endorsed into the goal; `digest/` reads what the digest run endorsed;
`store/` chunks it and indexes it. `knowledge/` asks the opposite question of a run that has already
finished — `known/` turns its own evidence into probes with no model call, `digest/` reads back typed
items and what they claim about what is stored, and `store/` writes the items, a chunk per confirmed
finding, and the claims as rows. Every orchestrator is reachable over HTTP only — there is no CLI
subcommand for them.

## `cli/`, `dump/`, `types/`

`cli/run.ts` reads a goal file, boots the same context the HTTP surface uses, executes one run,
prints a JSON summary and exits by the decision. `cli/replay.ts` re-decides every recorded iteration
of a pipeline's runs under every controller in the registry, under the pipeline's current policy, and
calls no model — it is how two strategies get compared on recorded evidence instead of by feel.
`cli/args.ts` is the shared flag parser.

`dump/build-run-dump.ts` and `dump/render-run-markdown.ts` build the dump folder in memory; neither
touches the disk. The layout is the contract later analysis reads: `manifest.json`, `run.md`, the
goal, the contract, the pipeline, a numbered folder per iteration, every prompt and response under
`05-llm/`, and the lessons. The writer is `modules/runs/dump-trace-store.ts`.

`types/raw.d.ts` is one ambient declaration for `*.md?raw`, which is what lets a lens persona live as
a markdown file beside its pipeline.

## Running it

```bash
# one run from the command line; builds first, prints the dump path
pnpm quality-loop:run --pipeline system-design --goal packages/quality-loop/prompts/system/order-history.md

# judge a supplied artifact instead of producing one
pnpm quality-loop:run --pipeline system-design --goal prompt.md --output answer.json --iterations 1

# the service on :3003, and the service plus its web client
pnpm quality-loop:serve
pnpm quality:start
```

```bash
# the orchestrators are HTTP only
curl -s -X POST localhost:3003/orchestrations/router \
  -H 'content-type: application/json' -d '{"goal":"# Prompt ..."}'

curl -s -X POST localhost:3003/orchestrations/calibration \
  -H 'content-type: application/json' \
  -d '{"pipeline":"agentic-design","goal":"# Prompt ...","samples":3,"maxIterations":1}'

curl -s -X POST localhost:3003/orchestrations/second-opinion/from-run \
  -H 'content-type: application/json' -d '{"runId":"<a finished run id>","samples":3}'
```

```bash
# re-decide recorded runs under every controller; no model is called
node packages/quality-loop/dist/main.js replay --pipeline system-design --limit 50
```

```bash
# the package's own specs: one vitest project, files run one at a time
pnpm exec nx test quality-loop
pnpm exec nx run-many -t lint typecheck test build -p quality-loop

# the purity and guarantee specs live in tooling/, which belongs to no Nx project,
# so nx never reaches them and they are a separate command
pnpm test:tooling
```
