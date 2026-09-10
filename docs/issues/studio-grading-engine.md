# The studio grading engine — `STUDIO`

Scope: the studio's grader — the rules engine and critic in
`packages/eval-worker`, the prompt generator in `packages/studio-api` — held
against the doctrine in
[../pipeline-best-practices/overview.md](../pipeline-best-practices/overview.md)
and the gap analysis in
[../pipeline-best-practices/gap-analysis.md](../pipeline-best-practices/gap-analysis.md).
The quality loop (`packages/quality-loop`) was built as the doctrine-shaped
answer to most of these; the studio does not yet use it. Conventions and the
index are in [README.md](./README.md).

---

### STUDIO-1 · Archetypes still drive prompt generation and coverage

**Status** open · **Severity** high · **Where** `packages/studio-api/src/modules/prompts/generator/{archetype-templates,requirement-banks,prompt-generator,enrich-prompt}.ts`, `modules/experiences`, `packages/eval-worker/src/engine/passes/expectations/banks`

**What.** Coverage expectations come from archetype banks, and an authored
prompt inherits a rubric by picking an experience. The requirement Oscar
wrote into
[../review-carefully-and-complete-with-refinement.md](../review-carefully-and-complete-with-refinement.md)
is stronger than the gap analysis's "make archetype optional": remove it
entirely, and derive coverage from the prompt's own requirements, because a
prompt can represent any archetype through what it demands.

**Evidence.** Gap-analysis §2.1: of 95 registered expectations, 65 are
pinned to exactly one archetype; only two apply to every prompt. Sixteen
non-spec files across `studio-api`, `criteria`, `contracts` and `studio-ui`
still name the concept. The quality loop's `deriveCriteria` step is the
working counter-example: one model call turns any goal into enum-locked
criteria with no archetype anywhere.

**Recommendation.** Requirement-derived coverage first (gap-analysis §3.1:
per-requirement expectation generators driven by each requirement and its
target, stable per-bullet ids), then delete the banks. What remains of
archetype is prompt flavour text in the generator, not a key anything
branches on.

**Verify.** `grep -ri archetype packages/*/src` returns only prompt-text
fixtures; an authored prompt with no experience selected is graded on the
same coverage as a generated one.

---

### STUDIO-2 · Two grading engines coexist

**Status** open · **Severity** high · **Where** `packages/eval-worker` and `packages/quality-loop/src/pipelines/system-design`

**What.** The studio grades through the eval worker: nineteen deterministic
rules decide the grade, one LLM critic annotates, caps apply by severity
count, and the output is score, letter, `capApplied` and findings. The
quality loop's `system-design` pipeline grades the same kind of artifact
through validators, critics, evaluators and a deterministic controller that
decides accept / revise / retry / escalate / reject with a factor trace.
Nothing outside `packages/quality-loop` imports it. Two vocabularies, two
dump formats, two places a threshold lives.

**Evidence.** `packages/eval-worker/src/engine/core/aggregator.ts`
(`capApplied`, `applyGradeCaps`); no import of `quality-loop` from
`eval-worker`, `studio-api` or `studio-ui`; the README's "Rules alone decide
the grade; critic findings annotate".

**Recommendation.** Decide the seam once. The cheaper direction is to route
studio evaluations through `RunsService.execute` on the `system-design`
pipeline and keep the worker's rules as that pipeline's validators — the
`validators` slot exists for exactly this, and the rules are already pure.
The alternative, retiring the quality loop for the studio, gives up the
controller, the trace and the memory tier. Either way STUDIO-3, -4 and -6
close with it.

**Verify.** One evaluation path in the studio; a submitted revision produces
a `QualityControlDecision` the client renders; the worker's rules appear as
validator reports in the trace.

---

### STUDIO-3 · Critic and evaluator collapse into one weakness ordinal; no controller

**Status** open · **Severity** medium · **Where** `packages/eval-worker/src/engine`

**What.** Every lens emits the same graded-weakness shape, so the
deterministic rubric is the sole source of credit and also defines the
ceiling. There is no accept / revise / escalate; confidence discounts a
penalty and is dropped at persistence, so the UI cannot show an uncertain
grade.

**Evidence.** Gap-analysis §2.2 and §2.3 with file and line references.

**Recommendation.** Resolved by STUDIO-2; the quality loop carries the
critic report, the criterion-shaped evaluator report and the controller
already. Not worth building a second time in the worker.

---

### STUDIO-4 · Judge robustness is containment, not measurement

**Status** open · **Severity** medium · **Where** `packages/eval-worker`, `packages/llm`

**What.** One sample per lens, no retry on `null`, no temperature, no
memoisation, no agreement tracking, and a critic re-raising a fired rule
double-charges.

**Evidence.** Gap-analysis §2.4; SEAM-3 for the seam half.

**Recommendation.** The quality loop's n-sample agreement (`samples`,
`minHits`) is the model; SEAM-2 and SEAM-3 cover the seam. The
rule-to-lens reconciliation in gap-analysis §3.4 ports the pattern from
`tooling/code-review/evaluator.ts`.

---

### STUDIO-5 · A thin finding contract and two display leaks

**Status** open · **Severity** medium · **Where** `packages/contracts` (studio findings), `packages/eval-worker/src/modules/poller/eval-runner.service.ts`

**What.** No defect-type taxonomy, no fixability, no stable artifact ids, no
schema version on persisted evidence. Two leaks let the model author what
the reader takes for the engine's: the critic's graded summary is stored as
the evaluation's summary when the critic ran (how-it-works §"known
wrinkle"), and the depth and narrative numbers are model-authored rather
than ordinals rendered through `LEVEL_SCORE`.

**Evidence.** Gap-analysis §2.5;
[../critic-eval-pipeline/how-it-works.md](../critic-eval-pipeline/how-it-works.md)
line "Known wrinkle".

**Recommendation.** Gap-analysis §3.5: a lens-chosen `type` enum,
`fixability`, stable ids, `schemaVersion`; show the engine summary and the
critic summary side by side; convert depth and narrative to ordinals the way
workability already is. Or, with STUDIO-2, inherit the quality loop's finding
contract, which has all of it.

---

### STUDIO-6 · Lenses are code, not records, and run serially

**Status** open · **Severity** medium · **Where** `packages/eval-worker/src/engine/passes/index.ts`

**What.** `EvalPass` is a function; the registry is a hand-written list; the
profile can only toggle a pass and hand it untyped options; dimension
mapping is hardcoded per lens; passes run one after another without needing
to.

**Evidence.** Gap-analysis §2.6.

**Recommendation.** The quality loop's lens records — id, persona as
markdown, criterion kinds, samples, `consumes` — are the template; with
STUDIO-2 this is inherited rather than rebuilt.

---

### STUDIO-7 · Dumps are read by nothing; no incident loop

**Status** open · **Severity** medium · **Where** `packages/run-dump`, `static/runs`

**What.** Every run, failures included, is dumped, and nothing reads the
dumps: no dump-to-fixture script, no outcome labels, no author feedback on a
finding, no aggregate over `index.jsonl`. The doctrine's loop ends in a
regression dataset; this one ends in a gitignored folder. The memory tier the
same section asked for now exists in the quality loop; the regression half
does not.

**Evidence.** Gap-analysis §2.7; memory-runs §11, last paragraphs.

**Recommendation.** A dump-to-fixture script that turns a chosen run into a
recorded-response spec (SEAM-6 needs the same thing); an author-outcome
label on findings (wrong / helpful) persisted as the seed of a golden set.

**Verify.** A production failure becomes a spec in one command, and the spec
fails before the fix and passes after.

---

### STUDIO-8 · `EVAL_DETERMINISTIC` grades with rules alone

**Status** open · **Severity** high · **Where** `packages/llm/src/create-client.ts`, `packages/studio-e2e/playwright.config.ts` and four requirement specs

**What.** With the flag set, or with no key, the studio grades with the
rules engine alone and byte-reproducible output; the README presents this as
a feature. Oscar's requirement is the opposite: evidence comes from a model
or the pipeline fails. The Playwright suite is built on the deterministic
path.

**Evidence.** `create-client.ts` line 21; `EVAL_DETERMINISTIC` in
`playwright.config.ts` and `src/requirements/{graded-narrative,ai-coach,evaluation-feedback,export}.spec.ts`.

**Recommendation.** Same move as SEAM-1, sequenced: first recorded responses
for the four journeys so the browser suite no longer needs the flag, then
remove the flag and the no-op path.

**Verify.** `grep -r EVAL_DETERMINISTIC packages` is empty; the e2e suite
passes against recorded responses.
