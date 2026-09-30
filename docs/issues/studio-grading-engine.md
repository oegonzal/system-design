# The studio grading engine — `STUDIO`

Scope: the studio's grader, held against the doctrine in
[../pipeline-best-practices/overview.md](../pipeline-best-practices/overview.md).
Every entry below is closed by one change: the studio's own engine
(`packages/eval-worker`) and prompt generator were deleted, and grading,
coaching and prompt generation became runs of the quality loop
(`packages/quality-loop`, pipelines `system-design-canvas` and
`design-prompt`) reached from `packages/studio-api` through one client port.
The entries are kept so the reasoning stays findable; conventions and the
index are in [README.md](./README.md).

---

### STUDIO-1 · Archetypes still drive prompt generation and coverage

**Status** closed · **Closed by** the delegation commits (contracts, db, quality-loop `design-prompt` and `system-design-canvas`, studio-api)

**What.** Coverage expectations came from archetype banks, and an authored
prompt inherited a rubric by picking an experience.

**How it closed.** There is no archetype anywhere: a prompt is markdown, its
criteria are derived from its own text by the loop's derive stage, and every
lens judges against those criteria. An experience is prose the `design-prompt`
pipeline writes from; the generator's banks are gone with the worker.

**Verify.** `git grep -i archetype packages` returns nothing outside the
migration that dropped the column.

---

### STUDIO-2 · Two grading engines coexist

**Status** closed · **Closed by** `feat(studio-api): grading, coaching and prompt generation are quality-loop runs`

**What.** The studio graded through the eval worker; the quality loop graded
the same kind of artifact through validators, critics, evaluators and a
deterministic controller, and nothing outside it imported it.

**How it closed.** One path. A submission is one `system-design-canvas` run
on the prompt's fixed criteria; the revision points at the run's iteration;
the studio reads the run back and grounds it onto the canvas. The worker's
rules were not ported as validators: what they encoded is now in the lens
personas, and the deterministic validators check references only.

**Verify.** `packages/eval-worker` does not exist; `EvaluationDto` is built
from a `QualityRunDto` alone (`packages/studio-api/src/modules/sessions/evaluation.mapper.ts`).

---

### STUDIO-3 · Critic and evaluator collapse into one weakness ordinal; no controller

**Status** closed · **Closed by** STUDIO-2

**How it closed.** Inherited: critics report defects, evaluators report a
result per criterion, the controller decides accept / revise / retry /
escalate / reject with a factor trace, and the studio shows the decision.

---

### STUDIO-4 · Judge robustness is containment, not measurement

**Status** closed · **Closed by** STUDIO-2

**How it closed.** Inherited: every lens of the canvas pipeline runs two
samples and an item needs two hits to count; a finding reconciled to a failed
criterion is never priced twice.

---

### STUDIO-5 · A thin finding contract and two display leaks

**Status** closed · **Closed by** STUDIO-2

**How it closed.** Inherited: the confirmed finding carries a type from a
declared taxonomy, fixability, stable structural keys, the lenses that
confirmed it and its rationale; the studio adds only the node and edge ids it
resolves by position. Nothing model-authored is shown as the engine's.

---

### STUDIO-6 · Lenses are code, not records, and run serially

**Status** closed · **Closed by** STUDIO-2

**How it closed.** Inherited: the canvas pipeline's lenses are records — id,
markdown persona, samples, `consumes` — and run concurrently within a wave.

---

### STUDIO-7 · Dumps are read by nothing; no incident loop

**Status** open · **Severity** medium · **Where** `packages/run-dump`, `static/runs`, `packages/quality-loop`

**What.** Every run is dumped and persisted, and nothing turns a run into a
regression fixture or records an author's verdict on a finding. Unchanged by
the delegation: the studio now produces `quality` runs, so the loop's dump and
`quality_run*` rows are the material.

**Recommendation.** A dump-to-fixture command that turns a chosen run into a
recorded-response spec; an author-outcome label on findings persisted as the
seed of a golden set.

**Verify.** A production failure becomes a spec in one command, and the spec
fails before the fix and passes after.

---

### STUDIO-8 · `EVAL_DETERMINISTIC` grades with rules alone

**Status** closed · **Closed by** `refactor: delete eval-worker; quality-loop replaces the worker in every environment`

**What.** With the flag set, or with no key, the studio graded with rules
alone and presented byte-reproducible output as a feature.

**How it closed.** The flag and the rules are gone. `QUALITY_LOOP_DETERMINISTIC`
is the one switch left, and it turns the model off honestly: a run escalates
with `llm-disabled` diagnostics and no score, the studio's `POST /criteria`
proxy answers 503, and the UI says the grader is unavailable. No test reaches a
model: studio-api binds a fake client, the loop's specs a fake model, and the
e2e suite a stub quality-loop server.

**Verify.** `git grep EVAL_DETERMINISTIC packages` returns only the llm spec
that proves the variable is no longer read.
