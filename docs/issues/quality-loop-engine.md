# Quality-loop engine — `ENG`

Scope: `packages/quality-loop/src/core` (normaliser, scoring, the controller
library, the loop, the replay tool) and the policy blocks of the four
pipeline definitions. Conventions and the index are in [README.md](./README.md).
The pages these entries cite: [../pipelines/memory-runs.md](../pipelines/memory-runs.md)
and [../pipeline-best-practices/quality-loop.md](../pipeline-best-practices/quality-loop.md).

---

### ENG-1 · Penalty-only dimensions carry weight without information

**Status** open · **Severity** high · **Where** `pipelines/{system-design,memory-recall,experience-digest}/definition.ts`, the `policy` block

**What.** A dimension earns from the criterion kinds mapped to it and loses
from the finding types mapped to it. Where no kind is mapped, the dimension
starts at 100 and can only fall — it carries weight without carrying
information. Three of the four pipelines declare such a dimension:

| Pipeline            | Earns from criteria                          | Penalty-only                |
| ------------------- | -------------------------------------------- | --------------------------- |
| `system-design`     | completeness, quality_attributes, compliance | soundness (.20)             |
| `agentic-design`    | all four — deliberately                      | none                        |
| `memory-recall`     | coverage, fidelity                           | precision (.25)             |
| `experience-digest` | attribution                                  | fidelity (.30), reuse (.30) |

**Evidence.** Four `system-design` runs on a byte-identical goal
(2026-09-07, `static/runs/**/decision.json`): soundness hit its
`maxPerDimension: 60` cap in every run and compliance sat at 100 in every
run, so `overall = 0.35·completeness + 0.30·quality_attributes + 23`
reproduces every score exactly. Four of the six finding types
(`contradiction`, `unsupported_claim`, `bad_assumption`,
`unhandled_failure`) route to the saturated dimension and are therefore free:
ten unsupported claims score the same as six. On `memory-recall`, precision
was `null` in run `2026-09-10T03-40-20-054-1a67fa` (nothing penalised it) and
renormalised out of the divisor. Recorded in memory-runs §1, "A declared
weight is not an earned one". CLAUDE.md states the rule — every declared
dimension must be earnable, asserted in the pipeline's spec — and only
`agentic-design` could pass such an assertion today.

**Recommendation.** For each penalty-only dimension either map a criterion
kind to it (the deriver already classifies; a `soundness`-shaped kind is a
persona sentence and a policy row) or drop its weight and let the finding
types that fed it route to a dimension that earns. Add the earnable assertion
to every pipeline spec. Run `main.js replay` before and after: the table of
decisions that change is the cost of the move, read off recorded evidence.

**Verify.** Each pipeline spec asserts that every dimension in
`dimensionWeights` has at least one kind in `criterionKinds` mapped to it.
The replay disagreement count between the old and new policy is reported in
memory-runs, not judged by feel.

---

### ENG-2 · One lost sample voids a whole lens

**Status** open · **Severity** high · **Where** `core/normalize.ts` (criteria agreement), the `evidence` policy of `memory-recall`, `experience-digest`, `agentic-design`

**What.** Evaluators run `samples: 2` and the policy demands `minHits: 2`
for a criterion to count as assessed. That is zero slack: if either sample
fails to produce a report, every criterion that lens judges becomes
`unassessed`, the `evidence` gate fires, and the controller escalates before
any score or floor is consulted.

**Evidence.** Run `2026-09-09T04-28-14-876-293eda` (memory-recall, inside
orchestration `5d6c74c0`): the coverage evaluator's first sample came back
`schema-miss`, the second `ok`; 11 of 12 criteria had one hit and stayed
unassessed; the decision was `escalate` at "8% of criteria assessed"; the
orchestration went on with 0 usable and 0 injected memories. The controller
was right for the evidence it had. The loss was upstream.

**Evidence, the other direction (2026-09-22).** Calibration `ff2ed9c9`
(`docs/pipelines/orchestrators.md` §6.2) ran the `memory-curator` brief three
times. In sample `2026-09-22T19-26-20-735-9c1b39` the generality critic's
first sample was a `schema-miss`; its second raised three `leaky_generality`
findings, all discarded `below-min-hits, 1 of 2 samples`. That type is gated,
so the blocker vanished and the run **accepted** at 76 — the two samples with
both critic answers confirmed it and were held for revise. A lost critic
sample removes a blocker; a lost evaluator sample escalates. Same cause,
opposite error.

**Recommendation.** Two moves, either sufficient, both cheap. (a) Retry a
schema miss once at the seam (SEAM-2), which removes the most common cause.
(b) Give evaluators `samples: 3` while keeping `minHits: 2`, so one lost
sample costs confidence, not the lens. (b) costs one extra evaluator call per
lens per iteration; measure before choosing.

**Verify.** Count `evidence`-gate escalations across recorded runs before and
after (`main.js replay` prints the gate's reason per iteration). The
`schema-miss` share of `exchanges` per run is the number to watch.

---

### ENG-3 · Defect grouping chains through shared refs

**Status** open · **Severity** medium · **Where** `core/normalize.ts#defectsOf`

**What.** Findings of one type are grouped into defects as connected
components over overlapping `locationRefs`, so agreement is transitive
through any shared ref. Two different defects that both touch one location
become one defect with the union of their refs. The rule is right for
artifacts whose locations are parts; it over-merges wherever a location is
shared by design.

**Evidence.** The 13-ref `misattributed_evidence` blob on digest run
`2026-09-09T03-34-00-679-05c7e0` was two defects chained through a shared
citation alias (fixed for that pipeline in `227f8f6` by making locations
places, memory-runs §12.6). The same rule produced an 18-ref
`leaky_generality` finding on an `agentic-design` target run on 2026-09-09,
where the locations are genuine sections. Since `650fb43` introduced the
overlap rule, digest admission fell from ~59% to ~42% of proposed memories
over 50 digests.

**Evidence, at the reconcile (2026-09-22).** Second opinion `8fa058ee`
(`docs/pipelines/orchestrators.md` §6.4) judged one fixed `agentic-design`
artifact with three fresh panels. All four opinions confirmed
`contract_mismatch`, `contradiction`, `leaky_generality` and
`unsupported_claim`, yet of 26 finding keys none was unanimous and only one
was shared by two panels: confirmed findings carried 8–33 refs each, so
location sets differed by a ref or two and every key was unique. Key-level
agreement between judges is unreadable on this pipeline until grouping is
anchored; type-level agreement reads fine.

**Recommendation.** Anchor-based grouping: a defect is keyed by one anchor
location per finding (the most specific ref the persona locates it at, which
the digest personas now name explicitly) and two findings share a defect only
when they share the anchor, not merely any ref. The change alters
confirmation rates on every pipeline, so it must be gated by a replay over
the recorded raw critic reports (the dumps keep them under each iteration's
`critics`); the ledger replay only re-decides and cannot re-normalise.

**Verify.** A re-normalise tool over the dumps prints, per pipeline, the
findings confirmed under each rule and the largest ref count; the change
ships only with that table in memory-runs.

---

### ENG-4 · No `evidenceRefs` distinct from `locationRefs`

**Status** accepted · **Where** `packages/contracts/src/lib/quality-loop`

**What.** The doctrine's finding shape carries both where a defect is and
what supports the claim. The engine carries only `locationRefs`, and the
digest's citations had been declared as locations to fill the gap — the root
of ENG-3's first instance.

**Evidence.** `227f8f6` resolved it for the one pipeline that needed it by
moving citations into the rationale. No second pipeline needs citations that
are not places.

**Recommendation.** Add `evidenceRefs` when a second pipeline needs it; the
digest is the template. Not before — an unused field on every finding is a
cost with no reader.

---

### ENG-5 · Memory reaches the producer only through the goal

**Status** accepted · **Where** `modules/memory/steps.ts`, `core/materialize.ts`

**What.** `LensContext` and `ProducerInput` are closed; `materialize` always
builds an LLM producer; no stage takes a parameter a pipeline can supply.
Recalled memory is appended to the goal under an advisory heading, and
`bareGoal` strips it again before the digest composes its record so the loop
cannot digest its own memory.

**Evidence.** memory-runs §9, "Why does memory reach the producer through
the goal?" — it is the only seam that does not open the engine, and the
engine staying closed was the requirement.

**Recommendation.** None until a second injection consumer appears. If one
does, a typed `context` slot on `ProducerInput` beats a second heading.

---

### ENG-6 · The trace lands only when the loop ends

**Status** accepted · **Where** `core/run-pipeline.ts`, the `sink`

**What.** The client polls the run row; per-iteration progress is not
streamed. A 20-minute run shows its verdict at the end.

**Evidence.** quality-loop.md, "Not built yet, by choice".

**Recommendation.** If it is built, emit through the existing `sink` per
iteration rather than a second channel.

---

### ENG-7 · No response memoisation; a re-grade re-bills

**Status** open · **Severity** medium · **Where** `packages/llm`

**What.** Nothing caches a lens response by content, so re-running a
recorded run against the same model re-bills every pass, and no experiment
can hold the judges fixed while varying the policy.

**Evidence.** No `cache` or memo in `packages/llm/src`; quality-loop.md lists
memoisation as not built; gap-analysis §3.3 asked for it.

**Recommendation.** A content-hash memo keyed by prompt hash, model, lens id
and sample index, stored beside the embedding cache (which already has the
shape), read before any call and written after. Make it opt-in per run so a
live run stays live.

**Verify.** A run replayed with the memo warm makes zero model calls and
produces the identical trace.

---

### ENG-8 · `agentic-design` accepts 6 of 40 iterations

**Status** watch · **Where** `pipelines/agentic-design/definition.ts`

**What.** Across every recorded `agentic-design` iteration the standard
controller accepted 6 of 40; the two most recent targets scored 67.4 and
67.5. This is the running experiment, not a defect: the pipeline is judging
hard briefs and the thresholds were set once.

**Evidence.** `main.js replay --pipeline agentic-design`, 2026-09-10: 40
iterations across 40 runs; lowest dimension among accepts, soundness 85.7,
the other three at 100.

**What to watch.** The per-dimension minima the replay prints. Any threshold
move is made from that table, never by feel, and is recorded in memory-runs
with the disagreement count it produces.

---

### ENG-9 · `replay` reads one page and does not say so

**Status** open · **Severity** low · **Where** `cli.ts`, `replayCli`

**What.** The replay lists complete runs with `limit: REPLAY_LIMIT, offset: 0`
and decides what comes back. Once a pipeline has more complete runs than the
page, the table is silently partial.

**Evidence.** `cli.ts` — one `repository.list` call; `experience-digest` is
at 79 runs.

**Recommendation.** Page until the repository returns fewer than the page
size; print the count read at the top of the table.

**Verify.** The header states "N runs read"; a fixture repository with more
runs than the page size is read in full.
