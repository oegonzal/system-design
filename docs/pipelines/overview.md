# The pipelines: how many there are, where the model sits, where the engine sits

A map of every path in this app that generates or grades something. The
engine's internals — passes, aggregator, scoring math — are covered in
[`../critic-eval-pipeline/how-it-works.md`](../critic-eval-pipeline/how-it-works.md);
this page sits one level above it and links down rather than repeating it.

Two facts organise everything below:

1. **There are five pipelines, and they are more different than alike.** Two
   run in the background off a job table in Postgres; three are synchronous
   HTTP requests. Two touch the deterministic engine; three never do.
2. **The model is called from nine places, and none of them can author a
   number.** Every call goes through one port, one structured request, `null`
   on any failure. What the model returns is either display prose, a bounded
   ordinal the engine prices, or a proposal that a validator and a human stand
   between and the grade.

---

## 1. The five, at a glance

| #   | Pipeline              | Trigger                                                         | Runs where                                | Model client (DI token)                       | Engine?                                                           | Dump kind    |
| --- | --------------------- | --------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------- | ------------ |
| 1   | Prompt generation     | `POST /prompts/generate`, `POST /prompts/:id/regenerate`        | studio-api, one request                   | `createLlmClientFromEnv` (`LLM_CLIENT`)       | No                                                                | `prompt`     |
| 2   | Submit for evaluation | `POST /sessions/:id/revisions` → `eval_job` row → worker poller | studio-api enqueues, eval-worker grades   | `createEvalLlmFromEnv` (`LLM_CLIENT`)         | **Is** the engine — `runEvaluation`, 7 passes, aggregator         | `eval`       |
| 3   | AI coach              | `POST /sessions/:id/improvement-runs` → `improvement_run` row   | studio-api persists the ask, worker loops | `createImproverLlmFromEnv` (`IMPROVER_LLM`)   | Yes — `runEngine` is the accept gate; accepted steps re-enter (2) | `improve`    |
| 4   | Binding suggestions   | `POST /sessions/:id/brief-suggestions` (the brief editor's Ask) | studio-api, one request                   | `createImproverLlmFromEnv` (`SUGGESTION_LLM`) | No — `validateBriefReferences` per item                           | `suggestion` |
| 5   | Interface suggestions | `POST /sessions/:id/interface-suggestions` (properties panel)   | studio-api, one request                   | same as 4                                     | No — graph + workflow validators per item                         | `suggestion` |

Not pipelines, for completeness: STAR stories CRUD, the read endpoints for
sessions, experiences and evaluations, and `POST /prompts` (the author path —
a caller's own requirements stored verbatim, no draw, no model; see §2).

```
studio-ui ──HTTP──► studio-api ──────────────────────────► Postgres ◄──poll── eval-worker
                      │                                        │                 │
   (1) generate ──────┤ generatePrompt → enrichPrompt → Prompt  │                 │
   (4) suggest ───────┤ suggestBindings ──► proposals (200)     │                 │
   (5) suggest ───────┤ suggestInterface ─► proposals (200)     │                 │
   (2) submit ────────┤ revision + evaluation + eval_job ───────┤── claim ──► runEvaluation ──► grade
   (3) coach ─────────┤ base revision + improvement_run ────────┤── claim ──► propose → runEngine gate
                      │                                        │                 └─► accepted revision + eval_job ──► (2)
```

---

## 2. Prompt generation

`packages/studio-api/src/modules/prompts/`. A request-scoped service, not a
job: deterministic templating, one optional prose-polish model call, one
insert — all inside the HTTP request, answered with `201` and the row.

`createPrompt` (`prompts.service.ts:201`) in order:

1. **Resolve an experience.** The one named, or `leastPracticedExperience()`
   (`prompts.service.ts:178`) — rotates by how often each has been practised.
   Experiences are the résumé link: six seeded `ExperienceProfile` rows in
   `packages/db/src/seed/experiences.fixture.json`, each hand-transcribed
   from a résumé bullet into an archetype plus concrete `scaleFacts`. There is
   no runtime résumé or PDF parsing anywhere; personalisation is offline data.
2. **Draw a seed.** `noveltySeed()` (`prompts.service.ts:152`) redraws while
   the candidate title collides with one of the last three prompts for that
   experience. Titles are generator-owned, so the comparison is stable.
3. **Generate, deterministically.** `generatePrompt` in
   `generator/prompt-generator.ts` is pure: one seeded PRNG (`mulberry32`,
   `generator/rng.ts:22`) consumed in a fixed order over three tables —
   archetype templates, requirement banks, workflow specs. The same input is
   deep-equal byte for byte. `GENERATOR_VERSION = '2.3.0'`
   (`prompt-generator.ts:22`) is stamped on every row for provenance. Unlike
   `ENGINE_VERSION`, nothing pins a seed to a fixed output across code
   changes; `[GEN-2]` only proves same-seed reproducibility.
4. **Enrich, optionally.** `enrichPrompt` (`generator/enrich-prompt.ts`) is
   the pipeline's single model call (`enrich-prompt.ts:55`). Its schema
   (`enrich-prompt.ts:17`) holds only `scenario` and up to two extra
   functional-requirement strings. The service then takes the NFR list, scale
   targets, functional capabilities, workflow spec and title **from the
   generator, never from the enriched result** (`prompts.service.ts:235`), so
   the polish cannot switch an eval rule on or off. No model, refusal, or
   schema miss → the generated prose stands with `llmEnriched: false`.
5. **Persist and dump.** `PromptDump` written in a `finally`, kind `prompt`,
   carrying `promptId` as the join key a later eval dump cites.

`author()` (`prompts.service.ts:58`) is the non-generative branch: `POST
/prompts` stores a caller's requirement set verbatim after referential
validation, with `seed: 0`, `generatorVersion: 'authored'`, `llmEnriched:
false`. It touches neither the RNG nor the model. It exists because an
assessment's exact requirement set cannot be reproduced losslessly by the
generator.

**Model client:** `createLlmClientFromEnv` (`packages/llm/src/create-client.ts:13`)
— API key or nothing. This is the one pipeline with no Claude Code
subscription route, on purpose: a subscription round-trip on every
generation would be too slow.

---

## 3. Submit for evaluation

The graded path. Fully diagrammed in how-it-works §1; the shape that matters
here:

- **API half** (`sessions.service.ts:286 submitRevision`): DTO shape errors
  are `400`, referential errors from the contracts validators are `422`, and
  one transaction writes `design_revision`, `evaluation (queued)` and
  `eval_job (queued)`. The job goes through the `EvalQueue` seam
  (`sessions/eval-queue.ts:11`), an abstract class with one Postgres
  implementation — the BullMQ swap point.
- **Worker half** (`eval-worker/src/modules/poller/`): `PollerService`
  claims with `SKIP LOCKED`, reaps stale `running` rows, and hands one job to
  `EvalRunnerService`, which builds `PromptFacts`, calls `runEvaluation`
  (`eval-runner.service.ts:107`), and persists findings (source `rule`,
  `expectation`, or `llm`), axes, scenarios, the full artifact list and the
  scoring trace. The lock is heartbeated at every pass boundary so a
  multi-minute deep eval is never mistaken for a dead worker.
- **UI half:** polls `GET /revisions/:id/evaluation` until `complete`.

This is the only pipeline where **all seven passes** run. The five model
passes — critic, depth, narrative, workability, scenarios — are the call
sites at `critic/anthropic-critic.ts:26`, `passes/depth/depth.pass.ts:53`,
`passes/narrative/narrative.pass.ts:129`,
`passes/workability/workability.pass.ts:121` and
`passes/scenarios/scenarios.pass.ts:60`. Each is an `EvalPass` with
`mode: 'llm'`, reached only through `ctx.llm`; how their output is admitted,
bounded and priced is how-it-works §3–4.

Iteration here is human: the author edits, submits again, and a new revision
gets a new job. Nothing loops on its own.

**Model client:** `createEvalLlmFromEnv` (`create-client.ts:34`), which reads
the raw `EVAL_DETERMINISTIC` with no override fork — grading determinism is
never switchable — then an API key, then `EVAL_AUTH=claude-code`.

---

## 4. The AI coach (improvement runs)

A separate pipeline that borrows the engine. It has its own table, its own
poller, its own client factory, and its own loop; what it shares with
submit-for-evaluation is the scoring function and the revision records.

- **API half** (`improvement-runs.service.ts:51 start`): refuses unless the
  improver is enabled (`improverAvailabilityFromEnv`), validates the posted
  draft with all four contracts validators, and in one transaction persists
  the draft as a `user`-origin base revision via `createRevisionRecords`,
  enqueues an `EvalJob` for that base through the same `EvalQueue` seam
  (`improvement-runs.service.ts:92`), and inserts a queued `improvement_run`.
  This service never proposes, never scores, never calls a model.
- **Worker half** (`eval-worker/src/modules/improver/`):
  `ImprovementPollerService` polls `improvement_run` on its own interval,
  deliberately not the eval loop — one run takes minutes and would starve
  every eval job behind it, including the ones the run itself enqueues.
  `ImprovementRunnerService` then iterates up to `maxIterations`:

  ```
  proposeImprovement(llm, best design + its findings)      llm-proposer.ts:255
     → canonicalizeGraphConfig        (off-vocabulary knobs quietly dropped)
     → validateGraphReferences + validateWorkflowReferences   → invalid graph: hard reject
     → validateBriefReferences / validateNarration            → invalid doc: drop that doc, keep the graph
     → runEngine(candidate)                                    improvement-runner.service.ts:95
     → accepted iff overallScore strictly rises                improvement-runner.service.ts:214
     → persistAccepted: assistant-origin revision + its own EvalJob row   :288, :301
  ```

  `runEngine` (`engine/engine.ts:17`) is the pure synchronous façade: the
  two deterministic passes plus the same aggregator, no model. So a live
  coach never touches a grade directly — it proposes, the deterministic
  engine judges, and every accepted revision then rides pipeline 2 as a
  normal `EvalJob` (written directly, since the worker owns the job table).
  Rejected candidates and every model exchange live only in the run dump
  (`writeRunDump`, kind `improve`).

- **UI half:** `GET /improvement-runs/:id` for the trajectory,
  `POST /improvement-runs/:id/cancel` to stop.

**Model client:** `createImproverLlmFromEnv` (`create-client.ts:70`), which
reads `IMPROVER_DETERMINISTIC` falling back to `EVAL_DETERMINISTIC`, then an
API key, then `IMPROVER_AUTH=claude-code`. A dev stack can therefore run
deterministic grades with a live coach.

---

## 5. The two suggestion pipelines

Both are synchronous computes that answer `200`, store nothing, and reason
about the **unsubmitted on-screen draft** posted in the request body — not a
persisted revision. Neither imports the engine; neither can. A proposal
reaches a grade only when a human accepts it into the canvas or brief and
later submits.

|                         | Binding suggestions (4)                                                                                                               | Interface suggestions (5)                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route                   | `POST /sessions/:id/brief-suggestions` (`sessions.controller.ts:82`)                                                                  | `POST /sessions/:id/interface-suggestions` (`sessions.controller.ts:92`)                                                                                                                 |
| UI entry                | the Ask button in the design-brief editor, whole draft at once                                                                        | the properties panel, one selected node                                                                                                                                                  |
| Service                 | `sessions.service.ts:83 suggestBrief` → `suggest-bindings.ts:38`                                                                      | `sessions.service.ts:145 suggestInterface` → `suggest-interface.ts:51`                                                                                                                   |
| Model call              | `suggest-bindings.ts:53`                                                                                                              | `suggest-interface.ts:70`                                                                                                                                                                |
| Enum-locked per request | `nfrId` (this prompt's NFRs), `mechanism` (the 18 `MECHANISM_CLAIMS`), `nodeIds` (this canvas)                                        | op kinds (`INTERFACE_CAPABILITIES[kind]`), fulfills (`fulfillableItems`), events the prompt declares, config knobs (`NODE_CONFIG_FIELDS[kind]`) with value domains                       |
| Free text allowed       | none                                                                                                                                  | operation names and responsibility text only                                                                                                                                             |
| Post-validation         | `admissible` (`suggest-bindings.ts:139`): eligible kinds, then `validateBriefReferences` on a one-binding brief (`:166`), one per NFR | `admissible` (`suggest-interface.ts:288`): each operation applied **alone** to a graph copy, kept only if `validateGraphReferences` + `validateWorkflowReferences` pass (`:305`, `:333`) |
| Withheld from the model | `MECHANISM_GUIDE[claim].proof` — labels only, so it cannot propose only what is guaranteed to corroborate                             | the same; both pinned by their specs                                                                                                                                                     |

The option space the interface suggester offers is **finite and declared in
`packages/contracts`**, not generated: `INTERFACE_CAPABILITIES` fixes role
and operation kinds per node kind, `NODE_CONFIG_FIELDS` fixes knobs and
their domains per node kind, and `fulfillableItems` reads the prompt's
workflow spec. The model ranks and names within that vocabulary; it cannot
mint a knob the engine could not read.

Both share one dump module, `suggestion-dump.ts` (kind `suggestion`, scope
`brief.suggest`, `suggestion-dump.ts:28`), which tells the two apart by the
proposal payload type rather than by run kind.

**Model client:** the same `createImproverLlmFromEnv` as the coach, bound to a
second token `SUGGESTION_LLM` in `studio-api/src/modules/llm/llm.module.ts`.
The reasoning in `llm.token.ts`: nothing a suggester returns reaches a grade,
so it may share the coach's determinism switch and subscription route, which a
button press can afford and prompt generation cannot.

---

## 6. The questions this page exists to answer

**Is the coach a different pipeline from submit-for-evaluation?** Yes.
Different table (`improvement_run` vs `eval_job`), different poller,
different client factory and env switch, and a loop versus a single pass.
They meet in two places: the coach calls the engine's sync façade as its
accept gate, and every revision it accepts is graded by submit's pipeline
through an ordinary `EvalJob` row. The coach is a producer of revisions;
submit is the consumer.

**Are the suggestion pipelines different from both?** Yes, and further apart.
No job table, no poller, no engine, no persistence — a request in, a list of
enum-locked, validator-filtered proposals out. What they share with the coach
is the client factory and the contracts validators; what they share with
submit is nothing but the validators.

**Is the prompt generator a different pipeline from the "iterative
critic-eval"?** Yes. The generator runs once per request in studio-api,
produces the prompt, and its model call is prose polish structurally unable
to reach a graded field. Evaluation runs in the background per revision in
eval-worker and consumes prompts. "Iterative" means two different things:
the human loop (submit again → new revision → new job) and the automated
loop (the coach, §4). Neither iterates inside the generator.

**Where exactly are models used?** Nine call sites, one port:

| Pipeline | Call site                                                           |
| -------- | ------------------------------------------------------------------- |
| 1        | `studio-api/.../prompts/generator/enrich-prompt.ts:55`              |
| 2        | `eval-worker/src/critic/anthropic-critic.ts:26`                     |
| 2        | `eval-worker/src/engine/passes/depth/depth.pass.ts:53`              |
| 2        | `eval-worker/src/engine/passes/narrative/narrative.pass.ts:129`     |
| 2        | `eval-worker/src/engine/passes/workability/workability.pass.ts:121` |
| 2        | `eval-worker/src/engine/passes/scenarios/scenarios.pass.ts:60`      |
| 3        | `eval-worker/src/modules/improver/proposers/llm-proposer.ts:255`    |
| 4        | `studio-api/.../sessions/suggestions/suggest-bindings.ts:53`        |
| 5        | `studio-api/.../sessions/suggestions/suggest-interface.ts:70`       |

studio-ui calls no model: it depends on `contracts` and `design-system` only
(`tooling/code-review/rules/boundaries.ts:28`).

**Where does the deterministic engine fit?** Only in
`packages/eval-worker/src/engine/`, with two entry points over one scoring
implementation: `runEvaluation` (`engine/core/orchestrator.ts:72`, async, all
passes, used by submit) and `runEngine` (`engine/engine.ts:17`, sync,
deterministic passes only, used by the coach). The boundaries matrix grants
`studio-api` and `eval-worker` no import of each other in either direction,
so the engine is unreachable from the API by construction, not by
convention.

---

## 7. What is shared

| Component                                                                                                                                                                                               | Lives in                                                                                  | Used by                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `LlmClient` port; `AnthropicLlmClient`, `ClaudeAgentLlmClient`, `NoopLlmClient`; `LlmRecordable.withRecorder` + `asRecordable` for dump capture                                                         | `packages/llm/src/`                                                                       | all five                                                                                          |
| Four env factories: `createLlmClientFromEnv`, `createEvalLlmFromEnv`, `createImproverLlmFromEnv`, `improverAvailabilityFromEnv`                                                                         | `packages/llm/src/create-client.ts`                                                       | 1 → plain; 2 → eval; 3, 4, 5 → improver under two DI tokens                                       |
| Run-dump plumbing: `writeDump`, `makeRunId` + `RunKind`, `GIT_CONTEXT`, `capText` / `jsonSafe`                                                                                                          | `packages/run-dump/src/`                                                                  | all five plus the quality loop, five kinds (`eval`, `prompt`, `suggestion`, `improve`, `quality`) |
| Vocabularies: `EvalDimension`, `Archetype`, `FunctionalCapability`, `WorkflowSpec`, `AxisFactorLevel`; `mechanisms.ts`, `node-config-fields.ts`, `interfaces.ts`, `quality-areas.ts`, `design-brief.ts` | `packages/contracts/src/lib/`                                                             | all three apps; imported by neither `llm` nor `run-dump`                                          |
| Validators: `validateGraphReferences`, `validateWorkflowReferences`, `validateBriefReferences`, `validateNarration`; `projectNarration`                                                                 | `packages/contracts/src/lib/*-validator.ts`, `narration.ts`                               | submit (2), coach start and loop (3), both suggesters (4, 5)                                      |
| `createRevisionRecords`                                                                                                                                                                                 | `packages/db/src/revision-factory.ts`                                                     | submit (2), coach start (3, API), coach accept (3, worker)                                        |
| Entities: `Prompt`, `ExperienceProfile`, `DesignRevision`, `Evaluation`, `Finding`, `EvalJob`, `ImprovementRun`                                                                                         | `packages/db/src/entities/`                                                               | 1, 2, 3                                                                                           |
| `EvalQueue` seam                                                                                                                                                                                        | `studio-api/src/modules/sessions/eval-queue.ts`                                           | submit (2), coach start (3) — API side only; the worker writes rows directly                      |
| `promptFactsFrom`                                                                                                                                                                                       | `eval-worker/src/modules/shared/prompt-facts.ts`                                          | eval runner (2), improver (3)                                                                     |
| `gradedWeaknessShape` / `toGradedItem` / `admitGrounding`; `describeDesign`                                                                                                                             | `eval-worker/src/engine/passes/graded-grounding.ts`, `engine/serialization/graph-text.ts` | the five model passes inside (2)                                                                  |
| `CRITERIA` registry (`[EVAL-n]`, `[GEN-n]`, `[UX-n]` ids tests claim)                                                                                                                                   | `packages/criteria/src/index.ts`                                                          | test suites across every pipeline                                                                 |

The pattern every pipeline repeats, without a shared base class: inject a
client by token → wrap it with a dump recorder → make one structured call →
treat `null` as the deterministic path → write the dump in a `finally`.

---

## 8. Which flags gate which pipeline

| Flag                                             | 1 generate | 2 evaluate     | 3 coach             | 4 / 5 suggest       |
| ------------------------------------------------ | ---------- | -------------- | ------------------- | ------------------- |
| `EVAL_DETERMINISTIC=1`                           | model off  | model off      | off unless below    | off unless below    |
| `IMPROVER_DETERMINISTIC=0`                       | —          | —              | overrides the above | overrides the above |
| `ANTHROPIC_API_KEY`                              | enables    | enables        | enables             | enables             |
| `EVAL_AUTH=claude-code`                          | —          | subscription   | —                   | —                   |
| `IMPROVER_AUTH=claude-code`                      | —          | —              | subscription        | subscription        |
| `LLM_MODEL`                                      | model id   | model id       | model id            | model id            |
| `EVAL_POLL_INTERVAL_MS`, `EVAL_STALE_RUNNING_MS` | —          | poller         | reaper window       | —                   |
| `IMPROVE_POLL_INTERVAL_MS`                       | —          | —              | poller              | —                   |
| `EVAL_POLLER_DISABLED=1`                         | —          | poller stopped | poller stopped      | —                   |
| `EVAL_DUMP_DIR`                                  | dump       | dump           | dump                | dump                |

Two consequences worth stating. CI and the e2e suite set only
`EVAL_DETERMINISTIC=1`, which silences every model call in the app.
`pnpm stack:up` (`scripts/stack.sh:19`) sets `EVAL_DETERMINISTIC=1` **and**
`IMPROVER_DETERMINISTIC=0 IMPROVER_AUTH=claude-code`, so the local stack grades
deterministically while the coach and both suggesters run live on the Claude
Code login. Prompt generation has no way onto a subscription; it needs a key.

---

## 9. Discrepancies noticed while mapping

Notes, not fixes. None affects behaviour.

- `packages/run-dump/src/write-dump.ts:2` says the plumbing is "shared by
  the two pipelines that dump". `RunKind` now has five members; the note in an
  earlier revision of this section said four, and was itself stale.
- `suggestion-dump.ts:13` calls itself "the third pipeline that talks to a
  model". The coach's dump was added afterwards and is inlined in
  `improvement-runner.service.ts` rather than living in its own module.
- how-it-works §6 counts "four call sites". The coach's proposer is a fifth
  caller of the port, outside the engine.
- how-it-works §6 describes the interface suggester's apply-alone check. The
  binding suggester's equivalent is `validateBriefReferences` over a
  one-binding brief, which the doc does not mention. A gap, not an error.
- how-it-works §4's known wrinkle still holds: when the critic ran, its prose
  summary is stored as the evaluation summary. The numbers are the engine's.

---

## 10. A sixth, standalone family: the quality loop

`packages/quality-loop` runs the generic doctrine from
[`../pipeline-best-practices/overview.md`](../pipeline-best-practices/overview.md)
over any task declared as data. Three such tasks now exist as sibling folders
under `src/pipelines/` — `system-design`, `memory-recall` and
`experience-digest` — and a fourth endpoint, `POST /memory-runs`, composes them
so a run can recall what earlier runs learned and digest what it learned itself.
It shares `@sysdesign/llm` (its own role: `QUALITY_LOOP_DETERMINISTIC` /
`QUALITY_LOOP_AUTH`) and `@sysdesign/run-dump` (kind `quality`) with the five
pipelines above and touches none of them. It has its own Postgres tables
(`quality_run` and its children, plus `memory_run` and `memory_embedding`) and
its own vector store (Qdrant, the `vectors` compose service); the dump remains
the full audit trail beside them.

How the loop works, its env variables and its guarantees:
[`../pipeline-best-practices/quality-loop.md`](../pipeline-best-practices/quality-loop.md).
How the three pipelines compose behind the memory API, how to operate it, and
what the recent runs showed: [`./memory-runs.md`](./memory-runs.md).
