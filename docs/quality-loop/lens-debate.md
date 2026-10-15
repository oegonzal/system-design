# How the lenses argue, and where to read it

A study guide to the debate inside the quality loop. It covers who says what to whom and in which
order, what each of them is shown, and where the engine — never a model — turns what they said
into a decision. Every statement names the file and the function that does it, so you can open the
code beside the text.

Paths are relative to the repository root:

- `ql/` is `packages/quality-loop/src/`
- `ct/` is `packages/contracts/src/lib/`
- `bs/` is `packages/browser-session/src/`

The browser session is the running example. It is the pipeline that runs most often, and the one
whose debate has been measured most. Sections 2–5 hold for every pipeline: a pipeline is data
(`ql/core/pipeline.ts`), and the debate is the engine's.

## 0. The cast

| Who            | What it is                                                                                   | Declared in                                                                                  | Built by                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| The deriver    | Turns the goal into the checklist `c1…cN`, once                                              | `deriveCriteria` (persona, `maxTokens`), plus `task.criterionKinds` and `task.fixedCriteria` | `ql/core/stages/derive-criteria.ts` `createCriteriaDeriver`                                                       |
| The producer   | Writes the artifact — for browser-step, one plan for one page                                | `producer` (persona, `maxTokens`, `consumes`, `instruction`)                                 | `ql/core/stages/llm-producer.ts` `createLlmProducer`                                                              |
| The validators | Exact checks over the artifact and the goal's index; no model                                | `validators`, each `block`, `cut` or `warn`                                                  | `ql/core/contracts/validation.ts` `indexedValidator`; browser-step's in `ql/pipelines/browser-step/validators.ts` |
| The critics    | Find defects, each of a declared type, at declared positions                                 | `critics` (`CriticSpec`: persona, `samples`, `maxItems`, `findingTypes`)                     | `ql/core/stages/llm-critic.ts` `createLlmCritic`                                                                  |
| The evaluators | Grade every criterion of their kinds, one result each                                        | `evaluators` (`EvaluatorSpec`: persona, `samples`, `criterionKinds`, `consumes`)             | `ql/core/stages/llm-evaluator.ts` `createLlmEvaluator`                                                            |
| The normaliser | Turns every report into one ledger; no model                                                 | —                                                                                            | `ql/core/evidence/normalize.ts` `normalize`                                                                       |
| The controller | Decides accept / revise / retry / escalate / reject from the ledger and the policy; no model | `controller` and `policy`                                                                    | `ql/core/controllers/compose.ts` `composeController`; the gates in `gates.ts`, the facts in `context.ts`          |

A model never decides:

- critics and evaluators produce **evidence**;
- the policy prices it;
- the controller's gates decide.

Whatever you change in a persona changes the evidence, never the rule. Boot checks every
declaration before a run can start (`ql/core/validate-pipeline.ts` `validatePipeline`, and
`ql/core/policy.ts` `validatePolicy` for the policy).

browser-step's cast (`ql/pipelines/browser-step/definition.ts`):

| Who              | Samples | Declared types or kinds                                      |
| ---------------- | ------- | ------------------------------------------------------------ |
| producer         | 1       | —                                                            |
| `critic.mission` | 1       | `skipped_step`, `stuck_loop`, `misread_page`, `wrong_target` |
| `critic.safety`  | 1       | `unsafe_action`, `trap_interaction`, `missed_stop`           |
| `evaluator.plan` | 1       | judges `progress`, `safety`, `grounding`                     |

All three lenses run in one wave: none is shown another's answer (section 2 says why).

## 1. One browser step, end to end

```text
 observe ─► compose the goal ─► run browser-step in the loop ─► read the run back ─► execute ─► carry state
 step-flow.ts   step-goal.ts        loop-brain.ts                 route-plan.ts       step-executor.ts  session-state.ts
```

0. **Once per session, the rubric.**
   - `bs/core/session-engine.ts` `deriveRubrics` asks `bs/adapters/loop-http/loop-brain.ts`
     `deriveRubric` for each pipeline's checklist. That is one `POST /criteria`
     (`ql/modules/runs/runs.service.ts` `deriveCriteria`).
   - Every run of the session is judged by that checklist.
   - The call is dumped as its own folder (section 4), and the session names it in
     `00-rubrics.json`.
1. **Observe** — `bs/core/step-flow.ts` `observe`.
   - The adapter reads the page: `bs/adapters/playwright/playwright-browser.ts` `observe`, and
     `observation-reading.ts` `toObservation`.
   - It keeps up to 150 elements (`ct/browser-session/observation.schema.ts` `ELEMENTS_BOUND`),
     main landmark first.
   - The accessibility snapshot is fitted to its bound by rung
     (`bs/adapters/playwright/aria-snapshot.ts` `fitSnapshot`). The rungs keep words, never
     wordless lines.
   - `noteObservation` (`bs/core/session-state.ts`) compares the page's identity with the last
     one (`ct/browser-session/observation-fingerprint.ts`). An unchanged page counts toward the
     stall rail; a page that moved clears the objections owed to the last page.
2. **Compose the goal** — `bs/adapters/loop-http/render-goal.ts` `composeStepGoalWithinBudget`
   over `ct/browser-session/step-goal.ts` `composeStepGoal`. The sections, in order:
   1. the mission, verbatim, with its own `# Mission` heading;
   2. `## Page` — the URL, the title, and what the last step did (`lastStepLines`): the action
      that ran, and what it planned past that action and held for this page;
   3. `## Elements` — `renderElementLine`, grouped by landmark (`groupedByLandmark`);
   4. `## Snapshot` — words; a ref the Elements list does not carry is taken off its line
      (`withoutUnlistedRefs`);
   5. `## Recent actions` — `historyLines`;
   6. `## Objections to answer` — `objectionLines`: why plans made on this page did not run;
   7. `## Units of work` — `ct/browser-session/step-goal-units.ts` `unitsLines`: the open and
      closed units with their declared identity, then the units on record by stance;
   8. `## Progress` — `progressLines`;
   9. `## Limits` — `ct/browser-session/step-limits.ts` `limitsLines`: each rule the validators or
      the session enforce, said once — the record line is the session's own check at taskStart,
      with the mission's exception as this page bears on it;
   10. last, the fenced `## Index` (`ct/browser-session/step-index.ts` `indexOf`), which only the
       validators read.

   Which of the mission's stop words this page shows is computed from the page as the browser
   read it (`ct/browser-session/mission-stops.ts` `stopsOnPage`), before anything is fitted.

3. **Run the loop.**
   - `bs/adapters/loop-http/loop-brain.ts` `planStep` posts the goal to `POST /runs` with the
     session's rubric. The criteria the session has settled are left out of the rubric and put in
     `## Progress` instead.
   - It asks for one iteration (`DECISION_ITERATIONS`). It asks for two
     (`DECISION_ITERATIONS_WHEN_NOTHING_RAN`) when the page is unchanged and the last plan ran
     nothing.
4. **Read the run back** — `ct/browser-session/route-plan.ts` `routePlan`. It never judges; it
   reads the decision's blockers (`blockersOf`):
   - a blocker at the plan as a whole refuses it;
   - a blocker or validator problem at a position cuts the plan there (`cutPointOf`);
   - a plan nothing cut runs whole, whatever the score;
   - held to the accept bar: only a plan carrying an action whose effect ends the session
     (`ct/browser-session/action-effects.ts`, `endsSession`), and a plan the evidence gate found
     under-judged.

   `objectionsOf` writes what the next plan must answer.

5. **Execute** — `bs/core/step-executor.ts` `executeActions`.
   - It runs the prefix and records each action in the history (`pushHistory`), by role and
     name, never by ref.
   - It sets `state.lastStep`: what ran, what it touched, what was held past it.
   - A `terminate` ends the session on the mission's stop, in the status the mission declares for
     it (`stopsOf`).
6. **Carry state** — `bs/core/session-state.ts` `SessionState`: history, objections, units of
   work, `lastStep`, settled criteria, the rails' counters. The next step's goal is composed from
   it.

## 2. One iteration of a run, stage by stage

The driver is `ql/core/loop/run-pipeline.ts` `runLoop`. One iteration is
`ql/core/loop/iteration.ts` `runIteration`: produce, validate, judge, normalise, decide.

| #   | Stage           | Where                                                                                    | In → out                                                                                                                                                                                                   |
| --- | --------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The checklist   | `run-pipeline.ts` `deriveOrAdopt` → `derive-criteria.ts`                                 | goal → `c1…cN`, fixed criteria first. A browser session derives once and supplies the checklist on every run.                                                                                              |
| 2   | Produce         | `iteration.ts` `produceOrAdopt` → `llm-producer.ts` `briefing`                           | goal (+ criteria if consumed) → the artifact. On revise it also gets the prior artifact and the remediations; on retry, the pitfalls; plus refusals and setbacks.                                          |
| 3   | Validate        | `iteration.ts` `validateArtifact`                                                        | artifact → reports. A `block` keeps the lenses out; a `cut` refuses positions and lets them judge.                                                                                                         |
| 4   | Judge, in waves | `ql/core/loop/waves.ts` `runLensWaves`                                                   | Wave 1: every critic, plus each evaluator that consumes nothing. Wave 2: evaluators that declared `consumes: ['findings']`, shown what the normaliser **confirmed** from the critics — never a raw report. |
| 5   | Normalise       | `ql/core/evidence/normalize.ts` `normalize`                                              | raw reports → the ledger (steps below the table)                                                                                                                                                           |
| 6   | Annotate        | `ql/core/evidence/annotate.ts` `annotate`                                                | each confirmed finding gets one critic's rationale — prose for readers; the controller never reads it                                                                                                      |
| 7   | Re-found        | `iteration.ts` `refound` → the pipeline's `refoundEvidence`                              | browser-step: on a page that shows nothing, a failed gating criterion is re-founded `not_applicable` (`ql/pipelines/browser-step/refound.ts`). Each rewrite is a `refounded` diagnostic on the ledger.     |
| 8   | Decide          | `ql/core/controllers/compose.ts` → `context.ts` `buildContext` → `gates.ts`              | ledger + policy → scores, the four facts, the blockers, a decision                                                                                                                                         |
| 9   | Remediations    | `annotate.ts` `noteRemediations`                                                         | what the controller selected → notes in the lenses' own words (list below the table)                                                                                                                       |
| 10  | Next            | `run-pipeline.ts` `afterDecision`; `ql/core/loop/briefing.ts` `refusalsOf`, `setbacksOf` | a terminal decision stops the loop; otherwise the next mode, and what the next attempt is told                                                                                                             |

The normaliser's steps (stage 5):

1. admit ids (`admitFindings`, `admitResults`);
2. group findings that touch the same location (`defectsOf`, `identity.ts` `sameDefect`);
3. confirm at `minHits` samples (`confirmFindings`); a lens that lost a sample is held to the
   samples it has left (`thresholdOf`);
4. settle each criterion by the lower-middle median of its results (`settleCriteria`);
5. mark findings that restate a failed criterion (`reconcileFindings`).

The remediation notes (stage 9):

- a finding's rationale;
- a criterion's "statement: the evaluator's reason";
- a validator's problems.

### What each lens is shown

Every prompt is built in `ql/core/stages/prompting.ts`. The system prompt is
`systemPrompt(role, persona)`: the pipeline's persona, then the engine's rules for the role
(`RULES`), then the output rule (`OUTPUT_RULE`). The user prompt is sections joined in order:

| Lens      | User prompt sections, in order                                                                                                                                                             | Answers with (`ql/core/stages/schemas.ts`)                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| deriver   | `# Criterion kinds`, `# Criteria already on the checklist` (the fixed ones), `# Goal`                                                                                                      | `criteriaSchema` — kind and statement, at most the room the fixed criteria leave |
| producer  | `# Goal`, `# Success criteria` (if consumed), the lessons (if consumed), the revise / retry / refusal / setback sections, `# Instructions` (the pipeline's `instruction` on a first draft) | the pipeline's `task.output.schema`                                              |
| critic    | `# Goal`, `# Success criteria`, `# Finding types` (only its own), `# Artifact`, `# Locations you may cite`, `# Known validation problems (already counted)`                                | `findingsSchema` (fields below the table)                                        |
| evaluator | `# Goal`, `# Success criteria` (of its kinds), `# Artifact`, `# Locations you may cite`, and `# Confirmed upstream defects` if it consumes findings                                        | `evaluationSchema` (fields below the table)                                      |

`findingsSchema` asks for:

- `type`, `severity`, `confidence` and `fixability`;
- `locationRefs` — where the defect sits;
- `criterionIds` — what it weakens; this is what "a finding cites a criterion" means;
- `rationale`.

`evaluationSchema` asks for exactly one result per criterion: `pass`, `partial`, `fail` or
`not_applicable`, with `locationRefs` as evidence and a `rationale`. A shorter reply is refused and
asked again.

`goalSection` strips the `## Index`, so no model reads the engine's bookkeeping.
`upstreamSections` writes the confirmed findings for an evaluator that consumes them. Each comes
with how many samples raised it: one sample's finding is "a claim to weigh, not a fact".

### How the evidence becomes a decision — `ql/core/controllers/context.ts` `buildContext`

- **Scores** — `scoreDimensions`.
  - Each criterion earns its kind's weight times its result's value (`priceCriteria`,
    `policy.resultValues`).
  - Each finding costs `penalties.bySeverity` times its confidence weight, decayed down the list
    and capped per dimension (`chargeFindings`).
  - A finding the evaluator contradicted — every criterion it cites judged `pass` or
    `not_applicable` — is charged at `penalties.contradicted` (`contradictedFindings`).
- **The four facts** (`gates` on the decision):
  - `validatorsPassed` — no `block` or `cut` report with an actionable problem;
  - `evidenceSufficient` — the share of criteria assessed is at least
    `evidence.minAssessedShare`;
  - `policyAllowed` — no blocking finding and no failed gating criterion;
  - `artifactPresent`.
- **Blocking** — a finding blocks when all three hold:
  - its type is gated, or its severity is in `blockingSeverities`;
  - enough samples agreed (`agreed`, `minHits`);
  - under `evidence.corroboration: 'cited'`, it cites a gating criterion the evaluator failed
    (`corroborated`).

  A gating criterion blocks when the evaluator failed it.

- **The gates, in order** — `ql/core/controllers/gates.ts`, composed by `STANDARD` in
  `ql/core/controllers/index.ts`:
  1. `artifact`
  2. `validators`
  3. `evidence`
  4. `policyAllowed`
  5. `acceptThreshold`
  6. `rejectFloor`

  Then `byRemediations` routes what is left. The first gate that settles decides, and the trace
  records each step (`decision.trace.steps`).

This is where the debate is won or lost. Under `cited`, a critic's finding vetoes only if the
evaluator — a second judge reading the same page — failed the criterion it cites. So the second
judge must read the page **apart** from the first. Boot enforces this: `checkCorroboration` in
`validate-pipeline.ts` refuses an evaluator of a gating kind that consumes findings under `cited`.

Measured 2026-10-08 on the 23 recorded goals of session `2026-10-08T07-39-33`:

- when the evaluator was shown the critics' findings, it failed a stop criterion only where the
  safety critic had raised one, in 24–41% of runs;
- every one of those stops was absent from its page;
- judging beside the critics, it failed none in 92 runs.

## 3. The prompts, byte by byte

A browser-step goal for a results page (step 8 of that session, recomposed by today's engine) is
62.3 KB. The models read 56 KB of it — the index (6.1 KB) is stripped:

| Section                   | Size    |
| ------------------------- | ------- |
| `## Snapshot`             | 35.7 KB |
| `## Elements`             | 11.1 KB |
| the mission               | 5.4 KB  |
| `## Limits`               | 1.9 KB  |
| `## Recent actions`       | 0.8 KB  |
| `## Page`                 | 0.7 KB  |
| `## Units of work`        | 0.3 KB  |
| `## Progress`             | 0.3 KB  |
| `## Objections to answer` | 0.1 KB  |

Each of the four calls (producer, two critics, evaluator) carries the goal plus its own sections,
so a step costs roughly 260–280 KB of prompt in one iteration. To see the bytes of any run, list
the sizes of `05-llm/*.user.txt` in its dump.

## 4. Reading a debate from disk

A session's dump is `static/sessions/<id>/`:

- `00-rubrics.json` — each pipeline's rubric, and the id of the dump of the call that derived it;
- `01-steps/NN/` — `observation.json`, `snapshot.txt`, `screenshot.png`, `plan.json`.

`plan.json` carries the `runId` of the loop run that planned the step. That run's dump is
`static/runs/<runId>/` (`ql/dump/build-run-dump.ts` `buildRunDump`):

| File                                                                            | What it is                                                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `01-goal.md`                                                                    | the goal, verbatim, index included                                                         |
| `02-contract.json`                                                              | the checklist the run was judged against                                                   |
| `03-pipeline.json`                                                              | the pipeline's summary (`ql/core/describe-pipeline.ts` `describePipeline`)                 |
| `04-iterations/NN/artifact.md`                                                  | the plan exactly as the judges read it                                                     |
| `04-iterations/NN/validation.json`                                              | the validators' problems                                                                   |
| `04-iterations/NN/critics.json`, `evaluators.json`                              | every raw sample, as the model answered                                                    |
| `04-iterations/NN/ledger.json`                                                  | the normalised evidence, after re-founding; its `diagnostics` name each `refounded` result |
| `04-iterations/NN/decision.json`                                                | the decision, the four facts, the blockers by key, the trace of gates                      |
| `04-iterations/NN/remediations.json`                                            | what the next attempt is told                                                              |
| `05-llm/NN.<scope>.<k>.system.txt`, `.user.txt`, `.response.json`, `.meta.json` | every model call; the scope is `producer`, `criteria`, or `<lensId>.s<sample>`             |

The rubric's own derivation is `static/runs/<stamp>-criteria/`
(`ql/dump/build-criteria-dump.ts` `buildCriteriaDump`). It holds `01-goal.md`,
`02-criteria.json`, `03-pipeline.json` and the deriver's exchange in `05-llm/`. Read it to see why
the checklist says what it says: which mission lines became criteria, and which did not.

To follow one debate, read in this order:

1. `run.md` — the summary.
2. `04-iterations/01/artifact.md` — what was proposed.
3. `05-llm/*critic*.user.txt`, then `critics.json` — what each critic was shown and said.
4. `05-llm/*evaluator*.user.txt`, then `evaluators.json` — what the evaluator was shown and
   judged.
5. `ledger.json` — what survived normalising (`discarded` says why the rest did not), and any
   `refounded` diagnostic.
6. `decision.json` — `trace.steps` shows which gate decided, and on what.
7. `remediations.json`, then the next `05-llm/NN.producer.<k>.user.txt` — what the producer
   heard.
8. Back in the session: the next step's `01-goal.md` — its `## Page`, `## Recent actions` and
   `## Objections to answer` are what the next plan was told.

## 5. The knobs, and the instruments to turn them with

| Knob                                                            | Where it is declared                                                                                             | What reads it                                                    |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Personas                                                        | `ql/pipelines/<id>/lenses/*.md`                                                                                  | `prompting.ts` `systemPrompt`                                    |
| The first ask                                                   | `producer.instruction`                                                                                           | `llm-producer.ts` `firstAsk`                                     |
| What the producer is briefed with                               | `producer.consumes`                                                                                              | `llm-producer.ts` `briefing`                                     |
| When an evaluator runs, and what it is shown                    | `EvaluatorSpec.consumes`                                                                                         | `waves.ts` `runLensWaves`; `prompting.ts` `upstreamSections`     |
| Finding types a critic may emit                                 | `CriticSpec.findingTypes`                                                                                        | `llm-critic.ts` `createLlmCritic`                                |
| Criterion kinds and their dimensions                            | `task.criterionKinds`, `policy.criterionKinds`                                                                   | `derive-criteria.ts`; `context.ts` `priceCriteria`               |
| What gates                                                      | `policy.criterionKinds[k].gate`, `policy.findingTypes[t].gate`, `blockingSeverities`                             | `context.ts` `buildContext`                                      |
| What a veto needs                                               | `policy.evidence.corroboration`, `minHits`                                                                       | `context.ts` `corroborated`, `agreed`; boot `checkCorroboration` |
| Prices                                                          | `dimensionWeights`, `resultValues`, `confidenceWeights`, `penalties` (`ql/core/policy.ts` `STANDARD_SCORING`)    | `context.ts` `scoreDimensions`                                   |
| Bars                                                            | `thresholds.acceptAt`, `thresholds.rejectBelow`                                                                  | `gates.ts` `acceptThreshold`, `rejectFloor`                      |
| Iterations                                                      | `policy.loop`; the session's `DECISION_ITERATIONS` and `DECISION_ITERATIONS_WHEN_NOTHING_RAN` in `loop-brain.ts` | `run-pipeline.ts` `runLoop`                                      |
| The page facts the validators check                             | `ct/browser-session/step-index.ts` `indexOf`                                                                     | `ql/pipelines/browser-step/validators.ts`                        |
| A mission's stops: cause word, ending, the words the page shows | `## Stop conditions` in the goal (`ct/browser-session/mission-stops.ts` `stopsOf`)                               | the limits validator; `step-executor.ts` on terminate            |

Instruments:

- **Replay a controller on recorded evidence.**
  `node packages/quality-loop/dist/main.js replay --pipeline browser-step --limit 100`
  re-decides every recorded iteration under every library controller and the current policy,
  with no model call (`ql/cli/replay.ts`).
- **Ask a recorded question again.** `POST /runs {pipeline, goal, criteria, maxIterations}` on
  `:3003`, with a recorded `01-goal.md` and `02-contract.json`, puts the same evidence question to
  the models again.
- **Measure what the lenses write** — `pnpm measure:bounds`.

## 6. What is still open

Measured at the end of the 2026-10-08 audit, on the 23 goals of session `2026-10-08T07-39-33`,
gpt-4o-mini. The numbers come from live runs of the recorded goals, not from one session. Where the
audit left the loop, against the same goals as the session sent them:

| Per step run                                  | Before (46 runs) | After (92 runs) |
| --------------------------------------------- | ---------------- | --------------- |
| The plan's first action ran                   | 24 (52%)         | 86 (93%)        |
| Plans refused whole                           | 22 (48%)         | 6 (7%)          |
| Plans vetoed for a stop the page did not show | 8 (17%)          | 0               |
| Mean time per run                             | 25 s             | 20 s            |

The six refusals that remain are validator cuts, not vetoes: a terminate on a page without its
stop's words, and a re-click of the card that had just run on an unchanged page.

- **The safety critic still writes a stop into almost every plan.** It raised `missed_stop` in
  89–100% of runs in every batch on record, on pages that showed no stop.
  - Judging apart, the evaluator contradicts it every time. The finding is priced at
    `penalties.contradicted` and never vetoes, but it still costs score.
  - Two levers are open. One is the persona. The other is a stop criterion that carries its cause
    as data, so that a stop tied to words the page does not show could be re-founded
    deterministically, as `refound.ts` does for a page that shows nothing.
- **After a click, the next plan starts its unit of work in a quarter to a third of runs** (8 of
  32 at the end). The rest re-click the card. The repeat rule cuts that, and the plan does not
  run.
  - The goal now says what the click reached and what was held for this page (`lastStepLines`).
  - The producer still prefers to click. Read its `05-llm/*.producer*` exchanges for those steps.
- **The snapshot is two thirds of every prompt** (section 3). Its words reach the models now; how
  many of them a plan needs has not been measured.
- **Not measured in this audit:**
  - session settlement (`reached`, `## Progress`, `serves`);
  - whether the page fingerprint should keep text lines;
  - `PAGE_REPLACING_WAITS`;
  - `autocomplete-off-bait`;
  - whether a cut should decide `revise` rather than `retry`. It was measured once, before the
    evaluator judged apart: the revision applied the hallucinated remediations, so it was not
    kept.
- **The deriver.** The session's rubric kept one of the mission's five never-do lines. Its
  exchange is now dumped (`<stamp>-criteria`), so the next derivation can be read where it was
  made.
