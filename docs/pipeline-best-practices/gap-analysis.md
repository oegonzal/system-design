# The critic/eval design against the doctrine: where it matches, where it differs

A comparison of the grading pipeline described in
[`../critic-eval-pipeline/how-it-works.md`](../critic-eval-pipeline/how-it-works.md)
with the generic critic → evaluator → controller doctrine in
[`overview.md`](./overview.md). Every claim below was checked against source by
an adversarial read-only audit (eleven agents, each told to refute before
confirming); the file references are the evidence. Paths written `engine/…`
live under `packages/eval-worker/src/engine/`.

This page is analysis and direction only. Nothing in it has been implemented.

Two questions that prompted it, answered first:

- **What "permits a model" means.** Each factory in
  `packages/llm/src/create-client.ts` checks the determinism flag first and
  returns the no-op client on `1`, whatever else is set. Only then does it look
  for `ANTHROPIC_API_KEY`, then the `claude-code` auth route; with neither it
  still returns no-op. A `0` removes a veto. It never creates a client.
- **Is LLM scoring subtraction-only?** Yes, by construction.
  `scoreGradedPenalty` (`engine/core/aggregator.ts:486`) prices each graded
  weakness at `8 × w(level) × w(confidence)`, decays, clamps at 20 per
  dimension, subtracts only from a dimension the deterministic layer already
  assessed, and is never seen by `applyGradeCaps`. The shared schema
  (`engine/passes/graded-grounding.ts:82`) offers `weakness: none | low |
medium | high` and nothing positive. The axis numbers depth and narrative
  return are model-authored, displayed, and never scored.

---

## 1. What already matches

| Doctrine item                                                       | Status                                                 | Evidence                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Deterministic validators before judges (§3.3, §8 rule 4, §11.10)    | Confirmed; a source-scanning gate makes it unbreakable | `tooling/grounded-scoring.spec.ts:41`; pass order `engine/profiles/default.profile.ts:27` |
| Every judgement carries evidence refs (§3.3, §11.3)                 | Confirmed; enum-locked, then re-checked                | `engine/passes/graded-grounding.ts:82`, `:118`                                            |
| Evaluators produce evidence, deterministic policy decides (§4, §14) | Confirmed structurally                                 | `engine/core/orchestrator.ts:118` `enforceMode`; `engine/core/aggregator.ts:390`          |
| Multiple evaluators, deterministic weighted aggregation (§8 rule 3) | Confirmed                                              | five lenses, nine weights, `validateProfile`                                              |
| A trace of input, output, evidence and decision (§3.7)              | Confirmed                                              | run dumps; `AggregateTrace`; `evaluation.evidence`                                        |
| An offline regression gate in CI (§12)                              | Confirmed for the engine                               | `engine/calibration.spec.ts` (three anchor blocks); four meta-gates under `tooling/`      |
| Adversarial pressure on the design under test (§12)                 | Confirmed, by data                                     | `engine/passes/scenarios/scenario-table.ts:24`; the model narrates, never invents         |
| Anti-gaming of deterministic grading                                | Confirmed                                              | keyword-dump, shotgun-claim and stray-node tests                                          |

The headline rule of the doctrine (§14, "LLMs produce evidence and
recommendations; the system owns validation, thresholds, routing, decisions and
state") is the organising principle of the engine and is enforced at the type,
orchestration, arithmetic and process levels. Two literal leaks are listed in
§2.5.

---

## 2. Where it differs

### 2.1 Coverage comes from archetype banks, not from the prompt's own contract

This is the largest gap against "handle versatile cases".

- Of 95 registered expectations, 65 are pinned to exactly one archetype. Only
  core's 2 apply to every prompt unconditionally; brief (13), narrative (4) and
  product (11) are feature-gated. `expectationApplies`
  (`engine/passes/expectations/types.ts:93`) reads archetype, difficulty,
  `nfrKind`, and an optional `appliesWhen`. The `Expectation` type has no way
  to reference a functional-requirement bullet, so no archetype expectation is
  requirement-derived at bullet granularity.
- An authored prompt inherits its experience's archetype
  (`packages/studio-api/src/modules/prompts/prompts.service.ts:86`).
  `prompt.archetype` is an unconstrained text column, and there is no "none of
  the above". Choosing an experience is choosing a rubric.
- NFR targets are read numerically by two kinds only: latency
  (`p99_latency_ms`) and consistency (`freshness_seconds`).
  `availabilityTargetPct` and `availabilityNines` (`engine/targets.ts:86`,
  `:96`) are written, documented and unit-tested, and called by nothing outside
  their spec. Durability, throughput, cost, security and observability are
  presence-gated only.
- The 100-rule catalogue is archetype-blind; the single branch on
  `facts.archetype` (`engine/rules/performance.ts:16`) widens a rule rather
  than restricting it. The product pack (`engine/passes/expectations/banks/product.ts:75`,
  `engine/rules/product.ts`) is fully derived from the prompt's `WorkflowSpec`
  and is the existing template for requirement-derived grading. It activates
  only on order-history today because
  `packages/studio-api/src/modules/prompts/generator/workflow-specs.ts:10` has
  one non-null entry.
- Functional requirements reach the deterministic grade through the
  four-member capability vocabulary and the per-index brief and narrative
  coverage. No LLM lens can ground a weakness to a functional requirement
  (`engine/passes/graded-grounding.ts:37`).

### 2.2 Critic and evaluator collapse into one weakness ordinal

The doctrine separates a defect-oriented critic report from a
criteria-oriented evaluator report with `pass | partial | fail |
not_applicable` per criterion and evidence polarity. Here every lens emits the
same `GradedWeaknessRaw`; the critic-versus-evaluator distinction is the
`lens` string on the artifact. The criteria-oriented half exists only in the
deterministic coverage pass, which no LLM can produce. No LLM evidence has
positive polarity. `partial` does not exist (`met` is a boolean, weights are
the substitute). `not_applicable` is an absence, so the trace cannot say why a
criterion was skipped.

The consequence of subtraction-only is that the deterministic rubric is the
sole source of credit. The archetype banks in §2.1 therefore also define the
ceiling and the meaning of "good".

### 2.3 There is no controller; confidence is a discount, not a trigger

- The evaluation's output is score, letter, `capApplied` and findings
  (`engine/core/aggregator.ts:165`). No accept, revise, retry or escalate; no
  gates object; no held or review status in `EVAL_STATUSES`; no reviewer role.
  Grade caps are ceilings keyed to severity count, not policy blockers.
  Security is a weight of 0.071.
- Low confidence prices a weakness down (`engine/core/aggregator.ts:51`) and
  is then discarded at persistence: `Finding` carries no `confidence` or
  `level`. The UI renders an LLM finding at deterministic weight with no signal
  that the grade rests on a hedged call.
- The coach has a real controller (strict-rise gate, `PLATEAU_AFTER = 3` at
  `packages/eval-worker/src/modules/improver/improvement-runner.service.ts:26`,
  and the stop reasons perfect, already-clean, max-iterations, plateau,
  llm-unavailable, cancelled). It is intra-run and amnesiac.
- Nothing detects a revision scoring lower than the previous one. The engine
  receives one graph, the API mappers project each evaluation independently,
  and the timeline never compares neighbours.

### 2.4 Judge robustness is containment, not measurement

- One sample per lens with no retry on `null`. No `temperature`, `seed` or
  `top_p` anywhere in `packages/llm` (`anthropic-client.ts:83`), so every lens
  samples at the server default. No response memoisation and no prompt-cache
  breakpoints, so a retry re-bills every pass. Determinism is achieved by
  disabling the judge, not by averaging it.
- No human-labelled golden set, no judge-agreement measurement, no drift job.
  `criticModel` (`packages/db/src/entities/evaluation.entity.ts:93`) records
  one of five lenses; the others live inside opaque `evidence` JSON with no
  `schemaVersion`. CI pins `EVAL_DETERMINISTIC=1`, so a prompt edit or a model
  bump passes unmeasured. No shadow or canary profile, although
  `profileVersion` is persisted for exactly that purpose.
- Rule-to-expectation double charging is handled by 28 suppressions;
  rule-to-lens is not. A critic that re-raises a fired rule subtracts on top,
  and the only defence is a `.describe()` sentence. The repo's other critic
  pipeline, `tooling/code-review/evaluator.ts`, already has a reconcile step.
- Four of five lenses read the deterministic findings and coverage
  (`engine/passes/deterministic-sections.ts:11`), titles and severities only,
  never a score. The coach's proposer is shown the score on purpose
  (`packages/eval-worker/src/modules/improver/proposers/llm-proposer.ts:86`).
- Nothing red-teams the pipeline itself: no prompt-injection narrative, no
  keyword-stuffed brief against a live critic, no oversized graph. The critic
  reads raw `functionalText` and narrative prose unprotected.

### 2.5 The finding contract is thinner than the doctrine's report shapes

- No defect-type taxonomy and no `fixability` or `suggestedFixType`;
  `source` classifies the producer, not the defect. LLM items are hardcoded to
  `suggestion: null` at two sites (`engine/passes/graded-grounding.ts:155`,
  `engine/passes/workability/workability.pass.ts:61`) although the field
  exists on the type and the coach's `toPatchOps` could fill it.
- No stable artifact id (findings are recreated with fresh ids on retry) and
  no evidence `schemaVersion`. Location and proof share one overloaded list.
- Two display leaks of model-authored verdicts. `evaluation.summary` is the
  critic's prose whenever the critic ran
  (`packages/eval-worker/src/modules/poller/eval-runner.service.ts:178`). Depth
  and narrative ask the model for 0–100 numbers
  (`engine/passes/depth/depth-schema.ts:43`,
  `engine/passes/narrative/narrative-schema.ts:46`), unlike workability, which
  asks for ordinals and derives its number.

### 2.6 Lenses are code, not configuration

`EvalPass` is a function; the registry (`engine/passes/index.ts`) is a
hand-written list; the profile can only toggle a pass and hand it untyped
`options`, which one consumer reads and nothing validates. Dimension mapping
is hardcoded per lens. All lenses share one bounds block and carry equal
authority; adding a sixth changes the achievable subtraction with no profile
entry recording it. There is no dedicated API/contract lens: 18 deterministic
interface rules plus prompt language in three lenses. Orchestration is
strictly serial although `enforceMode` guarantees an LLM pass cannot feed
another a scoring artifact.

### 2.7 No memory tier and no incident loop

Dumps capture every run, failures included, and nothing reads them: no
dump-to-fixture script, no outcome labels, no author feedback on a finding,
no aggregate over `index.jsonl`, no metrics endpoint. The doctrine's loop ends
in a regression dataset; this one ends in a gitignored folder.

---

## 3. Design direction

Ordered by leverage against the project's goals: generic over any prompt,
declarative, reuse before new code, low line count. Decisions taken on
2026-09-04 are folded in: score stays weakness-only with polarity recorded;
coverage derives from the requirement contract and archetype becomes
optional; n-sample agreement is on by default.

1. **Requirement-derived coverage.** Generalise the product-pack pattern into
   per-NFR-kind expectation generators driven by each `NfrItem` and its
   `targetSpec`: wire the dead availability readers, add readers for
   throughput, durability, cost, security and observability. Give functional
   requirements stable per-bullet ids carrying the capability tags the
   generator already assigns per seed, so both expectations and lenses can
   ground to a bullet. Demote the archetype banks to teach-text and difficulty
   flavour. Make archetype optional for authored prompts. Extends
   `Expectation` with a requirement reference; reuses `expectationApplies`,
   `engine/targets.ts`, and the product bank's shape.
2. **Doctrine-shaped evidence without breaking the number rule.** Add a
   criterion-oriented LLM artifact keyed by `expectationId | requirementId`
   with `result: pass | partial | fail | not_applicable`, confidence, rationale,
   evidence ids and polarity. Score policy stays weakness-only. Polarity and
   positive evidence feed the coach's prioritisation and the UI, and a
   profile-gated merit term waits until calibration data exists. Reuses
   `gradedWeaknessShape`, `admitGrounding`, and the artifact union.
3. **Judge robustness in the seam.** `temperature: 0` where the transport
   allows. Content-hash memoisation of lens responses in `packages/llm`, keyed
   by design hash, prompt hash, model, pass id and sample index, so a re-grade
   replays rather than re-bills. n-sample agreement on by default: `samples`
   and the agreement threshold are profile data on the existing `options`
   channel, and only items that recur across samples survive. A prompt-cache
   breakpoint on the shared `describeDesign` prefix. Persist `level`,
   `confidence`, agreement count and per-lens model on the finding and the
   evaluation.
4. **Rule-to-lens reconciliation.** One generic suppression: a graded item in
   the same dimension, grounded to the same requirement, with overlapping
   nodes as a fired rule or unmet expectation is suppressed or discounted and
   traced beside the existing suppressions. Port the reconcile pattern from
   `tooling/code-review/evaluator.ts`.
5. **Finding contract.** A lens-chosen `type` enum, `fixability`, an optional
   enum-locked `GraphPatch` on LLM items via the coach's `toPatchOps`, stable
   artifact ids, and `schemaVersion` on persisted evidence. Close the two
   leaks: show the engine summary and the critic summary side by side, and
   convert depth and narrative to ordinals rendered through `LEVEL_SCORE` the
   way workability already is.
6. **Declarative lens registry.** One generic graded-lens pass factory that
   consumes lens records: id, expertise prompt, dimension policy, grounding
   vocabulary, bounds, samples. Critic, depth, narrative and scenarios become
   records, which makes lens sets composable per prompt (an API-contract lens
   activates when operations are declared). Run lens records concurrently
   after the two deterministic passes and give the recorder an explicit pass
   scope.
7. **Controller and loop.** A deterministic revision delta in the API mapper.
   A dimension-level grade-confidence signal derived from the share of graded
   penalty that came from low-confidence items. An author outcome channel on
   findings (wrong, helpful) persisted as labels, the seed of a golden set. A
   dump-to-calibration-fixture script. A shadow-profile flag that scores a
   second profile into `evidence` without touching the grade.
8. **Judge evaluation harness.** An opt-in script that runs the lenses N times
   over the fixtures under a live client and reports item variance, grounding
   admissibility rate and agreement with pinned expectations, plus
   recorded-response specs through `fakeLlm` for prompt regression.

---

## 4. Not recommended here

A human review queue, online monitors on a telemetry stack, and canary
deployment infrastructure. At single-user scale the shadow-profile flag and a
dump aggregation script cover the doctrine's intent without the machinery.

---

## 5. Next phase

Each move above touches `packages/contracts`, the engine, and persistence, and
several move calibration pins. They need their own plan, with the pins re-set
deliberately and a reason recorded per change, before any code changes.
