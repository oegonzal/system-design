# Memory and retrieval — `MEM`

Scope: the `memory-recall` and `experience-digest` pipelines, the memory
module (`modules/memory`), admission, the pgvector store and the embedding
cache. Conventions and the index are in [README.md](./README.md). The page
these entries cite most is [../pipelines/memory-runs.md](../pipelines/memory-runs.md).

---

### MEM-1 · Persona compliance still costs admission

**Status** open · **Severity** medium · **Where** `orchestrators/memory/digest/read-digest.ts#memoriesToStore`, `pipelines/experience-digest/lenses/*.md`

**What.** A memory is excluded from the store when a confirmed finding is
located at it. `227f8f6` made locations places (the summary, each memory,
each unused alias) and asked the personas to locate a finding at the one
memory it faults, a missed signal at its unused alias, a duplicate at the
later memory of the pair. The model does not always comply, and every
non-compliance costs a memory nothing faulted.

**Evidence.** Both post-fix digests confirmed a `missed_signal` naming
memories beside unused aliases: `memory.5, memory.8, r13, r17, r18, r19`
(run `2026-09-09T04-39-38-294-cffb42`) and `memory.1, memory.8, r11, r12,
r14, summary` (run `2026-09-09T04-28-07-563-94d4b5`, iteration 2). Run
`2026-09-10T03-53-54-745-b79c03` confirmed two `duplicate_memory` findings
located at both memories of each pair; it kept 2 of 7 where compliance would
have kept 4. Grouping is no longer the cause (ENG-3 was fixed for this
pipeline); what remains is the persona.

**Recommendation.** Make the exclusion semantics data on the definition
rather than a request to the model: each finding type declares whether it
faults the memory it is located at (`misattributed_evidence`,
`unsupported_effect`, `vague_insight`, `run_specific`), is a gap that faults
nothing (`missed_signal`), or faults only the later of the refs it names
(`duplicate_memory`). `memoriesToStore` reads the declaration. No prose
heuristic, no change to core: the field lives on the pipeline's finding-type
table and the memory module reads it as data.

**Verify.** `compose.spec.ts` fixtures for each of the three semantics; the
two recorded digests above re-admitted under the rule keep 5 of 8 and 4 of 7.

---

### MEM-2 · Memory transfers, but improving answers is unproven

**Status** open · **Severity** high · **Where** the memory orchestrator, memory-runs §8–9

**What.** The live runs prove that a lesson survives the journey to an
unrelated prompt (§8 run 6: six order-history lessons kept and mapped onto
parcel-tracking criteria with honest caveats) and that the curator refuses a
store that cannot serve a brief (§8 run 7). They do not prove that an
injected memory raises the target's score. That comparison is one run each
on one prompt, with the score slightly down.

**Evidence.** memory-runs §9, "What did the live runs prove?"; §12.2.

**Recommendation.** A paired experiment: the same prompt run with recall and
with recall skipped (the orchestrator already skips it for a provided run;
a request flag to skip injection is one field), at least five runs per arm,
compared on `overall` and per dimension. One script over the run rows; the
result goes in memory-runs whichever way it points.

**Progress (2026-09-22).** The variance half of the experiment now has a
tool: `POST /orchestrations/calibration` runs the same goal k times and
reports the spread per dimension, so an arm's noise floor is measured rather
than assumed before the two arms are compared. The paired arms themselves are
still to run.

**Evidence (2026-09-23).** memory-runs §14: fifteen agentic memory runs,
43 lessons injected, cycle mean 63.5 against a like-for-like baseline of
63.6 (post-two-wave runs before the cycle); injected count and overall
uncorrelated (r = 0.1). Memory is measured inert at this store size on one
iteration; the paired arm without recall is what remains.

**Verify.** A table in memory-runs with n per arm, mean and spread per
dimension, and the prompts used.

---

### MEM-3 · No retrieval score floor; RRF trades sharpness for breadth

**Status** open (was blocked on data) · **Severity** medium · **Where** `modules/memory/pgvector`, `modules/memory/query-probes/`, the fusion in `orchestrators/memory/recall/fusion.ts`

**What.** Retrieval returns the top candidates by reciprocal-rank fusion
over the goal and up to six model-derived probes, with no score floor.
Fusion rewards a chunk that appears on many lists over one that scores
sharply on one, which may be the wrong trade for lessons. Both were deferred
deliberately when the store held six chunks: a floor set then would have
been a number invented to look like a measurement, and ranking only starts
to matter above roughly 48 chunks.

**Evidence.** The 2026-09-07 measurement (memory-runs §6): per probe an
availability probe hit the vendor-hop lesson at 0.7155 and a freshness probe
ranked the p99 lesson first, yet fusion over complete lists left it fifth.
The store is now at 287 points.

**Recommendation.** Run `POST /memory/retrieval-report` over the fifteen
agentic prompts and read the per-probe score distributions. Set a floor only
if a gap separates served from unserved candidates; otherwise record that it
does not and keep none. Try weighted fusion (a probe's own top score as its
weight) on the same report before changing the code.

**Verify.** The distributions in memory-runs, and the curator's `kept` /
`usable` counts before and after any floor.

---

### MEM-4 · A one-domain store injects little across domains

**Status** watch · **Where** the recall step, memory-runs §12.2

**What.** When every lesson in the store was written by `system-design`
runs, an `agentic-design` brief recalled 16 candidates, kept 8, and injected
none: the curator correctly found nothing that earned a place. As agentic
runs contribute their own lessons the number moves.

**Evidence.** §12.2 (0 injected at 166 lessons); orchestration `b795092a`
on 2026-09-10 injected 3 of 16 at 287 points.

**Evidence (2026-09-23).** With agentic lessons accumulating in the same
cycle, injection rose to 43 across 15 runs (mean 2.9, max 6) at 287 → 352
points; one run's pack fell short of the accept bar and injected nothing.

**What to watch.** `steps.recall.counts.usable` and `.injected` per memory
run, against the store size at the time.

---

### MEM-5 · Write-time deduplication, measured and not built

**Status** accepted · **Where** `modules/memory/pgvector`

**What.** The store dedupes only on exact `contentHash`, so two runs that
learn the same lesson in different words both persist.

**Evidence.** Measured three times across a five-fold growth of the store
(memory-runs §11): the closest pair of condition vectors scored 0.6949, then
0.7527, then 0.753 at 145 lessons over 10,440 pairs; nothing reached 0.80,
and the top of the distribution is a smooth continuum with no cluster near
1.0. Any threshold low enough to fire would delete lessons that differ.

**Recommendation.** Re-measure at roughly 500 lessons with the same script;
the shape of the distribution is the thing to watch, not any one number.

---

### MEM-6 · Nothing prunes either store; the embedding cache never expires

**Status** open · **Severity** low · **Where** `modules/memory/pgvector`, the embedding cache table

**What.** `replaceRunChunks` deletes only by run id; no retention rule exists
for lessons or for cached embeddings.

**Evidence.** memory-runs §11.

**Recommendation.** Retention as data: a lesson is pruned when its source run
is deleted; a cache row expires by model and age. Neither is urgent at 287
points.

---

### MEM-7 · Prepared but unused: keyword indexes, payload fields, an untyped `using`

**Status** closed 2026-11-12 for the indexes; the payload fields and the untyped `using` stay as noted · **Where** `pgvector/collection.ts`, `fromPayload`, `RetrievalProbeDto`

**What.** Every payload carries `storedAt` and `keys` and nothing reads
them back; `RetrievalProbeDto.found[].using` is `string` because `contracts`
cannot import the module's `VECTOR_NAMES`. The lineage indexes —
`lineage.judged.runId`, `lineage.adoptedFrom.runId`, `lineage.goalHash`,
declared in `INDEXED_FIELDS` and asked for on every boot beside the facets'
— were added for the coach recall's novelty screen, which reads `lineage`
off the hits after fusion instead; no probe filtered by them.

**Evidence.** memory-runs §11.

**Resolution.** Since the pgvector move only the filtered fields are indexed:
`INDEXED_FIELDS` is `runId`, `kind`, `pipeline`, `scope` and `unitKey`, each
an expression index the store makes sure of at boot, and neither the facet
nor the lineage indexes were recreated. The untyped `using` is still the one
place the named-vector vocabulary is not type-linked and is worth a
`satisfies` when contracts next changes.

---

### MEM-8 · `reindex` and `retrieval-report` have no specs

**Status** open · **Severity** medium · **Where** `modules/memory`

**What.** Both were exercised live — `reindex` performed the v1 to v2
migration, `retrieval-report` produced the §6 numbers — and nothing in the
suite covers them.

**Evidence.** memory-runs §11; the `fixtures/stored-memories.json` capture of
the pre-bump store was removed in the cleanup as dead, so the next bump
needs its own fixture.

**Recommendation.** A spec each against a fake store: `reindex` migrates the
fixture and the result round-trips; `retrieval-report` over a seeded store
returns the probes, each probe's ranking and the fused list.

---

### MEM-9 · Not built by choice, listed so nobody rediscovers them

**Status** accepted · **Where** the memory module

Filtered or per-project search; pruning and expiry (MEM-6); storing findings
and sections as chunks rather than only lessons (the kinds are already in the
vocabulary); a web-client control for memory runs; and any movement of the
two memory pipelines' thresholds against a corpus. Each was declined with a
reason in memory-runs §11 and quality-loop.md; the reasons still hold.

---

### MEM-10 · The digest routinely ends `revise` at its iteration cap

**Status** watch · **Where** `pipelines/experience-digest/definition.ts` — `loop.maxIterations: 2`, `misattributed_evidence: gate`

**What.** The digest accepts 16 of 137 recorded iterations. Most runs end
`revise` at the cap with a gated misattribution open; per-item admission
(memory-runs §9) then stores the memories nothing faulted, so the cap costs
little. The gate is doing its job: the revise iteration measurably fixes
citations.

**Evidence.** `main.js replay --pipeline experience-digest`, 2026-09-10; the
gate's effect in §12.6.

**What to watch.** Whether a third iteration would close blockers the second
left open. Measure before raising the budget: every extra iteration is real
model spend on both memory pipelines of every memory run. Ungating the type
is not recommended.

---

### MEM-11 · `MemoryStepDto.counts` keys are a convention, not a vocabulary

**Status** open · **Severity** low · **Where** `packages/contracts`, `orchestrators/memory/steps.ts`

**What.** The step reasons are a closed vocabulary; the count keys
(`probes`, `candidates`, `kept`, `usable`, `injected`, `iterations`,
`overall`, `memories`, `chunks`, `embedded`) are whatever `steps.ts` writes.

**Evidence.** memory-runs §11.

**Recommendation.** An `as const` key list in contracts the way the reasons
are declared, so the client and the docs can name them.
