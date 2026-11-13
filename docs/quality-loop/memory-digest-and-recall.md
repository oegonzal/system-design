# Memory: how a finished run becomes lessons, and how lessons come back

The quality loop's memory tier has two halves. **Digest** turns a finished quality run into a handful
of lessons and writes them to a vector store. **Recall** turns a goal into a search, hands what comes
back to a curating pipeline, and briefs a producer with what survived. This page walks both halves
step by step — what is read, what is kept, what is thrown away at each hop — and then answers eight
questions about them with measurements rather than opinion:

1. Is the digest generic and abstract enough to store knowledge that will generalise to other use cases?
2. Is the metadata stored per vector too hardcoded or specific, or is it useful?
3. Is valuable data discarded when the digest selects what to store?
4. Could more useful data be stored?
5. Is recall by vector similarity?
6. Is the query built the way the use case needs — the prompt we want lessons for?
7. Are useful chunks selected for the next step?
8. How is "similar enough" decided, and will it converge on the goal or diverge from it?

**What this rests on.** The code as it stands in the working tree on 2026-10-02 (branch
`template/pipelines-with-samgov-systemdesign`; `read-digest.ts`, `ports.ts`, `common.ts` and
`collection.ts` carry uncommitted edits that are described as they are, and `digest/endorsed.ts` is a
new untracked file). The live collection `quality-memory__v2__text-embedding-3-small__1536` (in
Qdrant then; a pgvector table in the stack's Postgres since 2026-11-12, carried over point by point),
386 points when the measurements started and 391 when they ended — a digest stored five lessons
during the pass. Every run dump under `static/runs`: 105 experience-digest runs (94 reached a judged
iteration), 98 memory-recall runs (88 judged), and the four coach runs that have recalled so far.
Two retrieval reports run against the live store. Where a number is a measurement it says so; where
it is a reading of the code it says that instead. Companion pages: `orchestrators.md` §4 for the
memory orchestrator as a whole, `reference.md` for the folder map, and `../pipelines/memory-runs.md`
for the history that produced the current design.

---

## 1. The two paths, at a glance

```text
DIGEST (learning)
  studio: a coach run settles  ──POST /orchestrations/memory/from-run──▶  memory orchestration
  or:     POST /orchestrations/memory { pipeline, goal }                      │
                                                                             ▼
  [target run]  ──fromRun()──▶  experience record (goal text)  ──▶  experience-digest pipeline
                                                                             │  deriver · producer · 2 validators
                                                                             │  3 critics ×2 · 1 evaluator ×2 · controller
                                                                             ▼
                               admission() + per-memory exclusion  ──▶  memories endorsed
                                                                             │
                               chunksOf() · embed both halves · replaceRunChunks()
                                                                             ▼
                                                 pgvector row: condition vector + lesson vector + payload

RECALL (using)
  studio: a coach run starts with recall:true   ──▶  MemoryRunRecall  ──▶  recallMemory()
  or:     the memory orchestrator's recall step                                │
                                                                              ▼
  goal head + focus lines (defects of the adopted iteration) + ≤6 model-derived probes
                                                                              │ embed · 2 named vectors each · one batch search
                                                                              ▼
                               reciprocal-rank fusion → 16 candidates → memory-recall pipeline (the curator)
                                                                              │ deriver · producer · 2 critics ×2 · 2 evaluators ×2 · controller
                                                                              ▼
                               readPack(): admitted, unfaulted, ranked by support → usable lessons
                                                                              │
                   orchestrator: appended to the GOAL (every stage reads it)   │   coach: producer briefing only
```

Both halves are orchestrator adapters over four ports (`orchestrators/memory/ports.ts`): an
embedding client behind a Postgres cache, a vector store, a query-probe deriver, and the
availability facts. `core/` knows none of this. The engine's only contact with memory is the
`AdvisoryMemory` the producer may consume, and that is shown verbatim and never interpreted.

---

## 2. Digest, step by step

### 2.1 How a digest starts

Two entry points, one orchestrator (`orchestrators/memory/definition.ts`):

| Entry                                            | What runs                                                                 | Who calls it                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `POST /orchestrations/memory { pipeline, goal }` | recall → target → digest → store                                          | the CLI recipes, the memory cycles in `memory-runs.md` §14 |
| `POST /orchestrations/memory/from-run { runId }` | recall and target **stand in** (`skipped / provided-run`), digest → store | the studio, for every coach run that settles               |

The studio path is `ImproveService.teach` (`packages/studio-api/.../improve.service.ts`): when a poll
observes a coaching run at `complete` and the row has no `digestOrchestrationId` yet, it posts the
run id and records the orchestration id on the row. Fire and forget, once per coach run. A grade
(the user's submit) is never digested — only coach runs, because they are the ones that iterate and
so carry transitions.

All fourteen memory orchestrations in the live database are `from-run` starts with target
`system-design-canvas`: seven stored lessons (3 to 6 of 7 or 8 proposed each), one endorsed nothing
(see §3.2), one had nothing to digest, four were cut off by server restarts (`interrupted`), one was
still running.

### 2.2 The digest step (`orchestrators/memory/steps.ts`)

```text
no target output         → skipped  upstream-skipped
embeddings disabled      → skipped  embeddings-disabled   (the digest is useless if nothing can be stored)
experience-digest absent → skipped  pipeline-unavailable
goal stripped at "## Remembered evidence (advisory)"   — remembered memory is never re-digested
fromRun(target) === null → skipped  nothing-to-digest    (no trace, no stop reason, or no iteration)
child run of experience-digest over renderGoal(record)
child did not complete   → failed   run-failed
memoriesToStore(child outputs, acceptAt)
  admission ≠ admitted   → complete  not-accepted | no-rubric | no-artifact   (counts: memories, kept 0)
  nothing unfaulted      → complete  no-memories
  otherwise              → complete  { digestRunId, memories }  (counts: memories proposed, kept)
```

### 2.3 What the record keeps, and what it drops (`pipelines/experience-digest/from-run.ts`)

`fromRun` is the one place a run is reduced before a model reads it. It is deterministic and judges
nothing. What it carries forward:

| Record field           | Source                                                                                                                                                                                                                                                                                                                                                        | Bound                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `prompt`               | `trace.contract.goal`, bare                                                                                                                                                                                                                                                                                                                                   | 12,000 chars                     |
| `artifact`             | the best iteration's `rendered` text                                                                                                                                                                                                                                                                                                                          | 16,000 chars                     |
| `iterations[]`         | per iteration: mode, decision, reason, overall, per-dimension scores, and the deltas against the previous iteration — the one figure computed here                                                                                                                                                                                                            | reason 200 chars                 |
| `criteria[]` as `r1…`  | every contract criterion: id, kind, statement, its result in each iteration (`unassessed` when a ledger has no row), and its transitions                                                                                                                                                                                                                      | statement 300 chars; 24 criteria |
| `findings[]` as `f1…`  | every confirmed finding across all iterations, folded by key with the latest reading kept: type, severity, confidence, fixability, first 8 location refs, first 4 weakened criteria, lenses, iterations seen, the **first sentence any critic gave it** (via `annotate`), whether the policy ever selected it, what it was reconciled to, and its transitions | rationale 200 chars; 32 findings |
| `omitted`              | how many findings and criteria the caps dropped                                                                                                                                                                                                                                                                                                               | —                                |
| `rules`, `maxMemories` | `DIGEST_RULES` (three sentences) and 8                                                                                                                                                                                                                                                                                                                        | —                                |

Transitions are not computed here: they are the engine's own `trace.lessons` (`persisted`,
`resolved`, `improved`, `regressed`, each with a detail capped at 120 chars), attached to the finding
or criterion they are about. A single-iteration run has none, and the record says so in words.

> **Transition.** A change between two iterations of the same run, recorded by the engine as a
> `Lesson` (`packages/contracts/.../decision.ts`) when it compares one iteration's ledger with the
> previous one. Four kinds: a confirmed finding **resolved** (it did not recur) or **persisted** (it
> was confirmed again); a criterion **improved** (`fail` → `partial`, say) or **regressed**. Each names
> its subject, the two iterations it spans, and a short detail. They live on the run's row in
> Postgres (`quality_run.lessons`, the trace header) and in the dump as `06-lessons.json`; the record
> renders them inline — `resolved i1→i2 (the finding did not recur)`, `improved i1→i2 (fail → partial)`.
> They are the only evidence of **cause** a digest ever sees: the rules allow a memory to claim a change
> in quality only where a transition or a moved score shows it, the deriver has a `transition`
> criterion kind for exactly that, and the attribution critic checks every claimed effect against them.
> A run with one iteration has nothing to compare, so it has no transitions.

Findings are ordered **remediated first, then by severity, then by first appearance**, so when the
cap bites, what the policy acted on is what survives. `fit` then trims the whole record to the
engine's 64,000-byte goal budget one cheapest step at a time: halve the artifact (never below 2,000
bytes), halve the prompt, drop the last finding, drop the last criterion.

What the record does **not** carry — none of this ever reaches the digest's model:

- the ledger's `discarded` items (evidence one sample raised and the other did not) and `diagnostics`;
- validation problems, and the text of remediation notes (only the boolean `remediated` survives);
- the decision trace: dimension traces, penalties, the gate ladder;
- any iteration's artifact but the best one, and nothing of any producer or lens prompt or reply;
- a critic's rationale past its first sentence, a finding's refs past the first eight;
- the location labels (`ArtifactLocation.label`), so refs like `binding.4` arrive as bare ids;
- the lessons the target's producer was itself handed (`QualityRunDto.recall`). A digest therefore
  cannot say whether a recalled lesson did any good.

Measured over the 94 judged digests: the finding cap was reached in 2 records (44 findings omitted
between them), the criteria cap never. Records hold a median of 9 findings (p90 21, max 32) and 20
criteria. Eighty-three of 94 source runs had a single iteration, five had two, six had three: **88% of
digests had no transition to reason about**, which matters for what the lessons can be (§4.1).

> **This figure has an expiry, and it has expired.** Measured 2026-10-02 over the 94 digests then
> recorded. Re-measured 2026-10-03 over the 18 canvas runs the service holds: **9 of 18 are
> multi-iteration**, and a resolved transition is citable from 7 of them. The corpus matured; the
> number did not. Every conclusion below that rests on "88% single-iteration" is weaker than it
> reads, and in particular a scarcity of transition-bearing lessons can no longer be explained by
> the sources. A measurement written into a document acquires an expiry at the moment it is written;
> this one says when it was taken, which is the only reason the drift was visible.

### 2.4 The goal the digest reads (`pipelines/experience-digest/input.ts`)

`renderGoal` lays the record out as sections, and the sizes below are a real canvas digest
(`2026-10-02T22-16-37`, 21,490 bytes):

```text
  # Source prompt            682 B   the brief, verbatim
  ## Outcome                 424 B   one line per iteration with scores and deltas
  ## Artifact (best i1)   12,750 B   the rendered canvas: ## Nodes 2.0 KB · ## Edges 1.3 KB · ## Brief 3.6 KB · ## Narrative 5.7 KB
  ## Criteria              1,115 B   "- [r1] functional · <statement> — i1 fail → i2 partial — improved i1→i2 (fail → partial)"
  ## Findings              3,963 B   "- [f1] data_integrity · high · confidence high · fixable_local · at binding.1, … · weakens r1, r2 · by critic.architecture · seen i1 · remediated · reconciled to r1 — <first critic sentence>"
  ## Rules                   295 B   the three DIGEST_RULES
  ## Limits                  211 B   "Propose at most 8 memories, each resting on 1–4 of the listed aliases. Give every listed alias exactly one place."
  ## Index                 1,622 B   fenced JSON: every alias → { kind: finding | criterion, ref: finding key | criterion id } — for the validators; a model is shown the goal without it
```

Across all 105 digest dumps the goal is a median 30.8 KB, max 40.0 KB — under the 64 KB budget
without trimming in all but two cases.

### 2.5 The experience-digest pipeline (`pipelines/experience-digest/definition.ts`)

A standard quality run, with the record as its goal:

| Stage                          | What it does                                                                                                                                                                                                                                                   | Bounds                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| deriver (`derive-criteria.md`) | one criterion per **signal** (a remediated finding, a closed gate, a failed or partial criterion) or **transition** (persisted, resolved, improved, regressed, a dimension that moved); never from Rules, Limits or Index                                      | ≤16 criteria, statement ≤1,200 chars (raised from 400 after one canvas record pushed statements to 751 and lost the whole run) |
| producer (`producer.md`)       | "the experience curator": one memory per real effect the record shows, resting on 1–4 aliases, `insight` as what to do or avoid "in terms a different prompt could use", `appliesWhen` as when it applies; every other alias under `unused`                    | ≤8 memories; insight ≤1,000, appliesWhen ≤500, summary ≤950                                                                    |
| validators                     | `references`: every alias placed exists and is placed once (critical, blocks); `limits`: every alias placed somewhere, ≤ maxMemories (high, blocks)                                                                                                            | exact, no model                                                                                                                |
| critics (2 samples each)       | `attribution` — effects the transitions do not show, acted-on evidence left unused; `provenance` — an insight that is not what its evidence says; `transfer` — holds only for this run, too vague to act on, or a duplicate (located at the later of the pair) | 10 findings each                                                                                                               |
| evaluator (2 samples)          | `attribution` — does a memory account for each derived criterion                                                                                                                                                                                               | pass / partial / fail / n.a.                                                                                                   |
| normaliser                     | `minHits: 2` — both samples of a lens must agree before a finding is confirmed                                                                                                                                                                                 | `minAssessedShare: 0.75`                                                                                                       |
| controller `STANDARD`          | attribution 0.4 (criteria, `missed_signal`, `unsupported_effect`) · fidelity 0.3 (`misattributed_evidence`, **gated**) · reuse 0.3 (`run_specific` **gated**, `vague_insight`, `duplicate_memory`)                                                             | acceptAt 75, rejectBelow 30, ≤2 iterations                                                                                     |

Cost, measured: a median 471 s per digest (p90 624 s), 10 model calls when nothing retries (median
19 with retries), about 86,000 output tokens for the one quoted above.

### 2.6 Reading the verdict (`orchestrators/memory/digest/endorsed.ts`)

`endorsedMemories` reads the digest run's **outputs**, never its prose:

1. `admission(outputs, 75)` (`core/outputs/run-outputs.ts`): `accept` is admitted; no criteria is
   `no-rubric`; no artifact is `no-artifact`; otherwise the best iteration must hold `artifactPresent`,
   `validatorsPassed` and `evidenceSufficient` and score ≥ 75. `policyAllowed` is deliberately
   **not** required — it is false while any blocker is open anywhere, and a blocker on the summary
   would otherwise veto every memory beneath it.
2. Every memory whose location (`memory.N`) any **confirmed** finding names is excluded. A finding
   located at the summary, or at an alias under `unused`, excludes nothing.
3. Each surviving memory's evidence aliases are resolved through the goal's own index into
   `{ kind, ref }` pairs — a finding key or a criterion id, joinable back to the source run.

The reader is generic over any digest pipeline whose artifact proposes `{ evidence, insight,
appliesWhen }` items against an aliased index; the experience digest binds it to its own schema and
index reader in `read-digest.ts`. That generality is new in the working tree and is what the peer's
document digest will plug into.

### 2.7 Chunking, embedding, storing (`orchestrators/memory/store/`, `modules/memory/pgvector/`)

One chunk per endorsed memory, two texts per chunk:

```text
text       = `${insight} — applies when ${appliesWhen}`         the whole lesson, as the curator and the producer read it
keys       = { condition: appliesWhen, lesson: insight }         the two texts actually embedded
contentHash= sha256(text)                                        the dedupe key on read
source     = { runId, pipeline, kind: 'lesson', ref: 'memory.N', decision, iteration, when }
evidence   = [{ kind: 'finding' | 'criterion', ref }]
digestRunId, model
```

`originOf` stamps the **best iteration's** decision and number, not the run's — a run that escalated
because a later revision produced nothing still has a judged iteration the lessons came from, and the
curator's rule 3 (below) reads that decision. `when` is the calendar day the source run started.

`indexMemories` embeds every key of every chunk in one batch through `CachedEmbeddings` (Postgres
table keyed by model and sha256 of the text; a cache that cannot answer degrades to a provider call,
never a failure), then `replaceRunChunks(sourceRunId, chunks)`: in one transaction, delete every row
whose `runId` matches and upsert the new ones with `pointId = uuid(sha256("runId|ref"))`. The
payload is the chunk plus `storedAt`, as jsonb. The collection is one table per index generation,
model and width (`vec_quality_memory__v2__<model>__<dims>` in the stack's Postgres, since the pgvector
move of 2026-11-12), with an HNSW cosine index per named vector and an expression index on each field
a filter narrows by: `runId`, `kind`, `pipeline`, `scope` and `unitKey`.

Two consequences worth stating plainly. The point id is a function of the source run and the memory's
position, so re-digesting a run **replaces** its lessons wholesale — last writer wins (§3.3). And
nothing dedupes across runs except an exact `contentHash` match, so the same lesson learned from two
runs of one brief is two points (§3.4).

---

## 3. What the digest funnel measures

### 3.1 The funnel, over every digest on disk

| Stage                        | Count | Note                                                                             |
| ---------------------------- | ----- | -------------------------------------------------------------------------------- |
| digest runs                  | 105   | 11 never reached a judged iteration                                              |
| judged                       | 94    | 37 from `system-design`, 48 from `agentic-design`, 9 from `system-design-canvas` |
| admitted                     | 90    | not admitted: 2 `no-rubric` (deriver schema miss), 2 `evidenceSufficient` false  |
| memories proposed            | 708   | **78 of 94 digests proposed exactly 8** — the cap is binding                     |
| proposed in admitted digests | 676   | 32 lost whole with the four unadmitted digests                                   |
| stored (unfaulted)           | 407   | 60% of admitted proposals, 57% of all                                            |

Per source pipeline: system-design 272 proposed → 181 stored (67%), agentic-design 365 → 187 (51%),
canvas 71 → 39 (55%). The live store's 386 points are fewer than 407 because re-digests replaced
earlier chunks and the restored dumps include digests whose source runs were later re-digested.

### 3.2 Why memories are excluded

269 memories were excluded from admitted digests. The confirmed finding types located at them (a
memory can carry more than one):

| Finding type             | Exclusions | Gated | Reading                                                                                                                                                                                                 |
| ------------------------ | ---------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `misattributed_evidence` | 125        | yes   | the insight is not what its cited aliases say — the exclusion the design most wants                                                                                                                     |
| `duplicate_memory`       | 101        | no    | the persona asks for the later of a pair; **42 of the 43 confirmed duplicate findings named both**, so the pair is lost rather than kept once                                                           |
| `vague_insight`          | 51         | no    | priced, not gated — yet item exclusion still removes it                                                                                                                                                 |
| `missed_signal`          | 40         | no    | **a gap, not a fault**: "acted-on evidence left unused". 20 of the 21 confirmed ones were located at a memory as well as at the unused aliases, and that memory is excluded for something it did not do |
| `run_specific`           | 26         | yes   | holds only for this run's names and numbers — correctly excluded                                                                                                                                        |
| `unsupported_effect`     | 25         | no    | claims a change the transitions do not show                                                                                                                                                             |

The `missed_signal` row is a persona-compliance leak the earlier admission fix (`memory-runs.md`
§12.6) did not close: the finding type describes an omission, the critic persona says to locate it at
the alias under `unused`, and in 20 of 21 confirmed cases a memory was named too — 40 memories
excluded for a gap. The `duplicate_memory` row is the other avoidable loss: the transfer persona says
"located at the later memory of the pair, so the lesson is kept once", and 42 of 43 confirmed
duplicate findings named both members, so roughly half of those 101 exclusions removed the copy that
was meant to survive. Together about 80 of the 269 exclusions — 30% — are for something other than a
fault in the memory.

One digest in the live set endorsed nothing with counts `memories 8, kept 0`: its deriver wrote
criterion statements over the then-400-char cap three times, no rubric existed, every lens skipped,
and `evidenceSufficient` was false. The orchestration row says `not-accepted` because that was the
code at the time; the current `admission` says `no-rubric` for the same case, so a schema miss is no
longer recorded as a verdict on eight valid memories.

### 3.3 Evidence the digest leaves on the table

Across the 94 records, 2,813 evidence aliases were offered (1,100 findings, 1,713 criteria) and 505
(18%) were placed under `unused`: 28 findings and **477 criteria**. The asymmetry is structural. The
deriver is told to derive a criterion only for evidence the loop _acted on_ or that _moved_, so a
criterion that passed in every iteration is never demanded by the rubric — the producer is asked for
"what passed and why", but nothing grades it on that, and 28% of criteria go unused. The lessons are
therefore overwhelmingly about defects (§4.1).

Three further discards happen after the model has spoken:

- **Re-digest replaces.** Source run `2026-09-30T03-02-25` was digested three times on 2026-10-02:
  the first derived no rubric, the second was interrupted at 89.7 with four unfaulted memories, the
  third stored three. Only the third's three stand; `replaceRunChunks` deleted the rest.
- **The digest's own synthesis is dropped.** Its `summary` (what the record shows moved quality,
  across all memories) and its `unused` list are never stored, nor are the critics' findings about
  the digest — so nothing records _why_ a memory was excluded.
- **Single-sample dissent vanishes.** Zero digests had a discarded (one-sample) finding naming a
  memory in the live set; where they exist they are not kept with the chunk.

### 3.4 What the store looks like now

Measured on 386 points, cosine on the stored vectors:

|                     | pairwise mean | p95   | p99   | nearest-neighbour median | neighbour in same pipeline (chance 42%) |
| ------------------- | ------------- | ----- | ----- | ------------------------ | --------------------------------------- |
| `condition` vectors | 0.308         | 0.457 | 0.532 | 0.582                    | 72%                                     |
| `lesson` vectors    | 0.357         | 0.492 | 0.557 | 0.621                    | 75%                                     |

A chunk's condition sits 0.534 from its own lesson, and 0.304 from other chunks' lessons — the two
halves are different registers, which is why there are two vectors (`quality-loop-rag-retrieval`,
`memory-runs.md` §6).

**Near-duplicates have arrived.** `memory-runs.md` §11 measured the top lesson pair three times as the
store grew to 145 and found nothing above 0.80 — "a smooth continuum, not the cluster a suppression
rule would need". At 386 the picture has changed: 7 cross-run lesson pairs above 0.80, 2 above 0.90.
The top two (0.943, 0.916) are both canvas lessons digested from two different coach runs of the
**same brief** on the same day — "include the failed cache lookup as a hop in the miss path" twice,
"monitor aggregation lag, not only the dashboard" twice. The partitioned-Postgres-unique-key lesson
exists four times (0.80–0.83). Ten chunks have a cross-run twin above 0.80, forty-one above 0.70. The
cause is the studio path: every settled coach run is digested, and a brief is coached many times. The
read-side dedupe cannot see this (different `contentHash`), so the curator is handed both and drops
one as `redundant_chunk` on every recall — about a hundred of 660 drop reasons say so in words.

**Run-local vocabulary leaks into "generic" text.** 44 of 386 lessons or conditions contain engine
aliases or location ids (`i1`, `r9`, `(f1`, `node.3`), e.g. "Reuse the i1 pattern that passed … (r14)
… (r15, r20)". A reader on another prompt cannot resolve those. 28 carry concrete figures (ms, %, rps)
— sometimes the point, sometimes the run's own numbers. The `run_specific` gate caught 26 of 676
proposals; the leak is smaller than that but real.

---

## 4. Answers: the digest

### 4.1 Is it generic and abstract enough to generalise to other use cases?

**The schema is; the content is one level below that.**

What is genuinely generic: `fromRun` reads only engine facts — findings, criteria, decisions,
transitions — that every pipeline produces in the same shape, so any registered pipeline's run can be
digested with no change (three pipelines' runs have been, with no pipeline-specific code anywhere). The lesson format
(`insight` + `appliesWhen`) is domain-free by construction, the producer is instructed to write "in
terms a different prompt could use", and the `transfer` critic plus the gated `run_specific` type
enforce it. The store knows nothing of system design.

What the lessons actually are, read in bulk: mid-level engineering heuristics tied to a _situation_ —
"when a p99 target spans several hops, budget every hop"; "a UNIQUE constraint on a partitioned
Postgres table must include the partition key"; "a fire-and-forget event emit cannot back a freshness
SLA". These transfer well **within** a domain and across its pipelines: a chunk's nearest neighbour
is in a different pipeline 25–35% of the time, and a canvas lesson is as close to its nearest
`system-design` lesson (0.560) as to its nearest canvas lesson (0.584). They do not transfer to an
unrelated use case: a CI-pipeline brief (§6.4) retrieved capacity and latency lessons at 0.75 because
those are the situations the store knows, not because they fit. That is the expected shape for a
store of design lessons, not a defect — but it bounds "other use cases" to ones whose artifacts have
latency budgets, capacity sections and dependency graphs.

Three things cap the abstraction level:

- **88% of digests saw a single iteration** — as measured on 2026-10-02; 9 of 18 canvas runs were
  multi-iteration by 2026-10-03, see the note in §2.3 — so the record holds what was _found_, not what _fixing
  it changed_. The rules forbid claiming an effect without a transition (§2.3), so lessons become
  "this defect is caught by the judges" rather than "this change resolved it". Only the eleven multi-
  iteration digests could learn a proven fix. This is a property of the lesson **text** — the `text`,
  `keys.lesson` and `keys.condition` of the stored row — not of any field: nothing on a stored chunk
  says whether it came from a transition, and the transitions themselves stay behind in Postgres on
  the source run's row. Two live points show the difference. From a single-iteration source
  (`2026-10-02T21-53-19`, `iteration 1`): _"When summing a per-hop latency budget for a cache-aside
  read's miss path, include the failed cache lookup itself as a hop … omitting the failed lookup
  understates the real total against a stated p99 target."_ — what a critic flagged, with no claim about
  what fixing it did. From a three-iteration source (`2026-09-30T03-02-25`, `iteration 2`): _"Giving a
  polling-only, access-constrained external dependency its own dedicated poller node … kept that
  constraint passing every iteration without regression … a durable store for its per-partition
  progress cursors and a stated replica/failover count, both raised once and fixed the very next
  iteration. Monitoring is a separate gap: … still unfixed when the run stopped."_ — three transitions,
  stated as effects, because the record had them to cite.
- **Passing criteria teach nothing** (§3.3): the rubric never demands them, so positive patterns —
  what a good design did — are a small minority of what is stored (`decision: accept` on 29 of 386
  chunks).
- **The cap of 8 is binding** in 78 of 94 digests. A record with 26 findings is compressed into
  eight lessons by the producer's judgement; the ordering remediated → severity decides what it sees
  first, nothing decides what it keeps.

### 4.2 Is the per-vector metadata too hardcoded, or useful?

The payload, and who reads each field:

| Field                           | Written             | Read back by                                                                                                                                               | Verdict                                                                            |
| ------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `text`                          | `chunksOf`          | the curator's query, `withMemory`, `recall.json`                                                                                                           | load-bearing                                                                       |
| `keys.condition`, `keys.lesson` | `chunksOf`          | nobody — `fromPayload` discards them                                                                                                                       | self-description only; useful for a re-index audit                                 |
| `contentHash`                   | `chunksOf`          | read-side dedupe (`searchMany`, `fuse`)                                                                                                                    | load-bearing                                                                       |
| `runId`                         | `originOf`          | `replaceRunChunks` delete filter; provenance line                                                                                                          | load-bearing                                                                       |
| `pipeline`                      | `originOf`          | provenance line only — the keyword index is never filtered on                                                                                              | shown, not used                                                                    |
| `kind`                          | constant `'lesson'` | provenance line; indexed, never filtered                                                                                                                   | vestigial today (`section`, `finding`, `criterion` are declared but never written) |
| `ref` (`memory.N`)              | `chunksOf`          | point id; provenance                                                                                                                                       | load-bearing for replace                                                           |
| `decision`, `iteration`         | `originOf`          | provenance line; **rule 3** ("a chunk whose iteration was decided reject or escalate may inform a risk, never a recommendation") — 71 drop reasons cite it | useful                                                                             |
| `when`                          | `originOf`          | provenance line                                                                                                                                            | weak signal; the curator could prefer newer evidence but is not told to            |
| `evidence[]`                    | resolved aliases    | **nobody**                                                                                                                                                 | write-only provenance                                                              |
| `digestRunId`                   | the digest step     | **nobody** (the re-index tool reads it from the orchestration record instead)                                                                              | write-only                                                                         |
| `model`, `storedAt`             | adapter             | nobody; the model is already in the collection name                                                                                                        | redundant                                                                          |

So the metadata is not hardcoded in the sense of domain words — there is no "system design" anywhere
in it — but it **is run-shaped**: `decision` and `iteration` presume the chunk came from a judged
iteration. The first generalisation is already straining it: the peer's document digest (untracked
`packages/memory-ingest`, contracts `document-digest.ts`) will store résumé and notes facts as chunks
with `kind: 'lesson'` and `pipeline: 'document-digest'` as the discriminator, and must invent a
`decision` and an `iteration` for a document that was never judged. `ChunkSource` is the memory-recall
pipeline's own input schema (`chunkSourceSchema`), reused as the store's payload so that a stored
chunk is a valid candidate without conversion — the right coupling for lessons, the wrong one for
facts.

What is missing that would be useful, in order of how cheaply it falls out of data already in hand:

1. **Filterable facets** — the finding types and criterion kinds a memory rests on, and the
   transition kind (`resolved` is a proven fix; `persisted` is a standing risk). The `evidence[]`
   array holds the refs; summarising kinds and types onto indexed fields costs nothing and would let
   a probe prefer same-domain or fix-proven lessons (§7).
2. **Usage** — whether the chunk was ever retrieved, kept, judged usable, handed to a producer, and
   whether the defect it was recalled for resolved in the next iteration. None of that is recorded
   anywhere today, and it is the only route to a score floor, pruning, or an answer to "does memory
   help" that is not an experiment.
3. **A domain tag declared on the pipeline**, not inferred from text, so the store can be partitioned
   as it grows without the search having to learn the partition.

### 4.3 Is valuable data discarded in selection?

Yes, at five places, two of them avoidable without touching `core/`:

| Where              | What is lost                                                                                                                                         | Size (measured)                                                         | Avoidable?                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `fromRun`          | lens disagreements, remediation note text, dimension traces, non-best artifacts, rationale beyond one sentence, the recall the producer had          | by design                                                               | partly — the recall record is the one omission that blinds the system to its own effect |
| the rubric         | criteria that passed; "why it worked"                                                                                                                | 477 of 1,713 criterion aliases unused                                   | yes — a `pattern` criterion kind would demand them                                      |
| the cap            | everything past 8 lessons                                                                                                                            | 78 of 94 digests at the cap; records up to 32 findings                  | partly — a second, model-free `finding` chunk layer would keep the rest (§4.4)          |
| per-item exclusion | memories faulted for an omission (`missed_signal`, 40) or the surviving half of a duplicate pair (about 42 of the 101 `duplicate_memory` exclusions) | about 80 of 269 exclusions, 30%                                         | yes — persona wording, or `endorsedMemories` excluding on fault types only              |
| the store          | the previous digest's lessons on re-digest; near-twins accumulate; `summary`, `unused`, the critics' findings                                        | 3 stored of 7 unfaulted across one run's three digests; 10 twins > 0.80 | yes — merge instead of replace; link twins at write                                     |

And on the recall side, which is where the most valuable discard happens (§6.3): every recall computes
the **gaps** — the needs of the query no stored lesson serves — and throws them away. 88 recall runs
named a median of 5 gaps each. That is a measured list of what the store should learn next, and nothing reads it.

### 4.4 Could more useful data be stored?

Ranked by value per unit of change, each phrased as data on a definition or an adapter — none needs
`core/` to move:

1. **Record recall effectiveness on the chunk's side.** Join `recall.json` (which lessons, for which
   focus defects) to the next iteration's ledger (did those defects resolve) and write a usage row per
   chunk. This is the paired experiment `memory-runs.md` §15 asks for, made continuous.
2. **Store the gaps.** A `wanted` collection or table keyed by the query's prompt: when a later digest
   stores a lesson whose condition matches a wanted gap, the loop has visibly learned something it was
   missing.
3. **Store `finding` chunks beside `lesson` chunks**, with no model call: the confirmed finding's
   type, first critic sentence, location _kinds_ (not ids) and the criterion it weakened, from the
   ledger directly. The vocabulary (`CHUNK_KINDS`) already allows it. It would preserve what the cap
   of 8 drops and give recall a finer-grained, defect-shaped index — exactly what the focus lines
   search for.
4. **Keep the transition on the chunk** (`resolved` / `persisted` / none) and let the curator's rules
   use it: "a lesson from a resolved finding is a fix; from a persisted one, a risk".
5. **Demand positive evidence in the rubric** — a `pattern` criterion kind for criteria that passed
   in every iteration under a stated mechanism — so "what passed and why" has something grading it.
6. **Merge near-twins at write time.** The distribution now has the cluster the earlier measurements
   were waiting for (§3.4); a write that finds a twin above ~0.85 on the `lesson` vector should add
   its evidence and source to the standing point rather than a new one.
7. **Keep the digest's `summary`** as a run-level chunk (`kind: 'section'` is declared), so a recall
   can find "what went wrong with designs for this kind of brief" as well as individual lessons.

---

## 5. Recall, step by step

### 5.1 How a recall starts

| Trigger                                                                                 | Focus                                                             | Where the lessons go                                                                      |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| the memory orchestrator's `recall` step                                                 | none — the goal alone                                             | appended to the **goal**, under `## Remembered evidence (advisory)`; every stage reads it |
| a run started with `recall: true` (`RunsService` → `RunRecallSlot` → `MemoryRunRecall`) | the defects of the iteration the run adopted, when it adopted one | the **producer only**, under `# Lessons from earlier runs (advisory)`                     |

The studio asks for the second on every coach start (`sessions.service.ts`: `coach: { recall: true }`)
and never on a grade. A pipeline whose producer does not declare `consumes: ['memories']` is refused
before a row opens; a run that can never call its producer records `skipped / no-produce-iteration`.
`MemoryRunRecall` asks the store how it stands _now_ (the orchestrator asks once, at open), builds the
focus with `focusOf`, and calls the same `recallMemory` the orchestrator's step calls — so the two can
never curate differently.

### 5.2 Building the search (`orchestrators/memory/recall/`)

```text
readiness      embeddings enabled · store ready · chunks > 0 · memory-recall registered     else skipped with the reason
query          queryText(goal) = the bare goal's first 16,000 bytes
focus          focusLines(focusOf(base)):   ≤5 confirmed findings, worst first → "data integrity (high): <first critic sentence>"
                                             ≤3 criteria, fail before partial → "c5 fail: <statement>"      each ≤240 chars
probes         LlmQueryProbes.derive(query, focus): one structured call, persona probes.md, ≤6 conditions ≤240 chars, maxTokens 1,000
                 "write them in the register of a stored condition … one per demand … for a focus line, the situation that produces the defect"
                 on any error → [] and the recall proceeds on the goal alone
probe set      [ goal head, d1…d8, p1…p6 ]  blanks and repeats removed; up to 15 texts
embed          one batch, cache first; the goal's vector is usually cached, the probes rarely
search         probesOf(vectors, 16): every text against BOTH named vectors → up to 30 searches in one queryBatch
                 the goal keeps the full limit (16); every other text gets ceil(16 / texts) — 3 with six probes, 2 with focus too
                 each search over-fetches ×3 and dedupes by contentHash before cutting to its limit
fuse           reciprocal-rank fusion, k = 60, across every list; a chunk's two lists (condition, lesson) collapse to one probe index
                 dedupe by contentHash keeping the best-scoring copy; ties broken by hash; top 16
zero hits      → skipped store-empty
```

The goal is **always probe zero with the full budget**, so the fused list can only add to what a
bare search would have found — but it also means the goal's 16-deep list dominates a fusion where
each derived probe contributes 2 or 3 ranks. In the live retrieval report for a canvas brief, 13 of
the 16 fused candidates were in the goal's own list.

### 5.3 The query the curator reads (`pipelines/memory-recall/input.ts`)

`buildQuery` hands the pipeline a `MemoryQuery`: the prompt verbatim, the three `RECALL_RULES`, the
focus lines, the derived probes, `maxKept: 8`, and each candidate as `{ text, source, matched }` —
**the retrieval score is never shown**; `matched` lists which focus and probe aliases surfaced the
chunk, and the persona is told that is "the condition a search matched, not evidence that the chunk is
any good". `renderGoal` writes it as:

```text
# Memory query
<the prompt>
## What is wrong now            (focused recalls only)
- [d1] data integrity (high): Create writes synchronously to the primary (edge.4) then …
- [d6] c5 fail: Redirect availability must be 99.95% monthly.
## Candidates
### [m1] lesson · run 2026-10-02T21-53-19-… · system-design-canvas · iteration 1 · decided revise · 2026-10-02 · ref memory.5
<text>
Retrieved under d5, p4.
…
## Retrieved under
- [p1] a cache write-through populate can fail or be evicted and the redirect path's only fallback is …
## Rules · ## Limits · ## Index
```

A focused query ran 21.6 KB median across the dumps (max 24.1 KB), well under the budget.

### 5.4 The memory-recall pipeline (`pipelines/memory-recall/definition.ts`)

| Stage                           | What it does                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| deriver                         | one **need** per aspect of the query remembered evidence could inform; one **admissibility** criterion per rule; "when the query says what is wrong now, the defects listed are needs too, and the first to state"                                     |
| producer ("the memory curator") | exactly one verdict per candidate: `kept { chunk, serves ≤200, insight ≤720, caveat ≤340 }`, `dropped { chunk, reason }`, `gaps[]` the needs nothing serves; ≤8 kept                                                                                   |
| validators                      | `references` (every verdict names a listed candidate, once; critical) · `limits` (every candidate judged; ≤ maxKept; high)                                                                                                                             |
| critics ×2 samples              | `relevance` — kept chunks serving no need, redundant pairs, dropped chunks that would have served a need, `no_usable_memory` once; `grounding` — insights the chunk does not say, contradictions without a caveat, chunks superseded by later evidence |
| evaluators ×2                   | `coverage` over needs; `admissibility` over rules (**gated**)                                                                                                                                                                                          |
| controller `DIMENSION_FLOOR`    | coverage 0.4 · precision 0.25 · fidelity 0.35; `no_usable_memory` gated; `unsupported_insight` priced, not gated — the producer sees the chunk's own text beside the insight; acceptAt 75                                                              |

Measured: 224 s median per recall (p90 439 s), 10 model calls, about 47,000 output tokens. The
coach's lesson budget is therefore roughly four minutes and ten calls per coach run before the coach
itself starts.

### 5.5 Reading the pack and handing it on

`readPack`: `admission` as for the digest; kept chunks a confirmed finding names are excluded; each
survivor's `support` is the number of **passing** criteria that cite it; usable lessons are sorted by
support, descending.

Then the two deliveries differ in a way that matters:

- The **orchestrator** appends to the goal one line per lesson — provenance, the stored `text`, then
  `serves`, `insight`, `caveat` — within the 64,000-byte budget, dropping the lowest-ranked first.
  Every stage, the deriver and judges included, reads it; the lead says no criterion may derive from
  it, which is an instruction to a model, not a guarantee.
- The **coach** producer is briefed with `briefingOf`: `[m8] <curator's insight> — serves: …; caveat: …`.
  Note what is _not_ there: the stored lesson text. The producer reads the curator's paraphrase of the
  lesson, a second lossy hop; the original is only in `recall.json` and the dump. Judges see nothing.

`recall.json` on the coach run records status, reason, the recall run id, the lessons exactly as
handed over (with the stored text and source run), and the focus searched for.

---

## 6. What the recall funnel measures

### 6.1 Over every recall on disk (88 judged runs)

| Stage                                  | Measured                                                                                                                               |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| probes derived                         | 6 in 83 runs, 0 in 5 (the deriver returned nothing; recall went on with the goal)                                                      |
| focus lines                            | 8 in the two focused coach recalls; 0 in all earlier runs                                                                              |
| candidates                             | 16 in 81 runs (the full budget), fewer only when the store was small                                                                   |
| kept by the curator                    | **8 in 81 runs** — the second binding cap                                                                                              |
| usable after the curator's own critics | median 5; distribution 1:1 · 2:11 · 3:12 · 4:17 · 5:25 · 6:14 · 7:6 · 8:2                                                              |
| gaps named                             | median 5 (5:27 · 6:32), out of ~12 needs derived                                                                                       |
| verdict                                | accept 74, revise 12, escalate 2; overall mean 79.8                                                                                    |
| dimensions                             | coverage **62.1** mean (min 0) · precision 92.4 · fidelity 97.8                                                                        |
| kept with a caveat                     | **675 of 691 (98%)**                                                                                                                   |
| confirmed finding types                | `unsupported_insight` 103 · `redundant_chunk` 48 · `missed_chunk` 47 · `misleading_chunk` 24 · `irrelevant_chunk` 15 · `stale_chunk` 5 |

Two readings. Precision and fidelity are high and coverage is low: the curator is good at rejecting
what does not fit and the store rarely holds what a query needs — half its needs go unserved. And 98%
of kept lessons needed a caveat, which says in the curator's own words that stored lessons almost
never match a new context without translation.

### 6.2 Does retrieval rank predict what the curator keeps?

Across 1,351 candidates offered in those 88 runs:

| Fused rank | Usable |
| ---------- | ------ |
| m1–m4      | 41%    |
| m5–m8      | 38%    |
| m9–m12     | 19%    |
| m13–m16    | 17%    |

| Candidate                                                      | Usable            |
| -------------------------------------------------------------- | ----------------- |
| matched a probe or focus line                                  | 30% (342 / 1,136) |
| surfaced by the whole prompt only                              | 24% (52 / 215)    |
| matched a **focus** line                                       | 34% (10 / 29)     |
| from `system-design-canvas` (same domain as the coach queries) | **62%** (18 / 29) |
| from `system-design`                                           | 31% (253 / 811)   |
| from `agentic-design`                                          | 24% (123 / 511)   |

So fusion carries real signal — the top half is twice as likely to be usable as the bottom half — and
probes add a little over the bare prompt. The strongest predictor by far is **same-domain source**,
and nothing in the search prefers it: the keyword index on `pipeline` exists and `searchMany` passes
no filter. Canvas lessons were only 29 of 1,351 candidates because they are days old; as the studio
digests more coach runs that share will rise on its own, but the ranking will still treat a 2026-09
agentic lesson and yesterday's canvas lesson alike.

### 6.3 What the curator throws away, and what it names as missing

660 candidates were dropped. The reasons are prose; a rough keyword pass finds 99 "redundant with a
kept chunk", 95 "different mechanism or no such element in this design", 71 citing the escalated or
contradicting source rule, 14 "too generic", and the rest varied. Read directly, the modal drop is
_a correct lesson about a situation this design does not have_ — token revocation, vendor hops,
index-migration cutovers — retrieved because the store has few lessons about what the query does
have.

Gaps, from the live coach recalls, say exactly that: "No candidate addresses how custom-alias
uniqueness is guaranteed alongside system-generated codes", "No candidate addresses the basic
redirect-to-long-URL correctness path". Those are the two functional requirements of the brief that
no run has ever been judged on. The gaps are computed on every recall and kept nowhere.

### 6.4 Two retrieval reports against the live store

`POST /memory/retrieval-report` runs probes, embeddings and the search with no pipeline. For the
canvas brief the coach runs were recalling for (682 chars, "campaign link shortener"):

| Probe                                                                                | Best cosine (condition / lesson) | Top hit                                                            |
| ------------------------------------------------------------------------------------ | -------------------------------- | ------------------------------------------------------------------ |
| the whole prompt                                                                     | 0.395 / 0.399, the 16th at 0.33  | a coverage-counter cutover lesson — noise                          |
| p1 "a redirect path must meet a p99 latency target under 50 ms"                      | **0.651** / 0.570                | "state a latency budget that accounts for every hop"               |
| p3 "a click-count metric is allowed to lag real time by a bounded number of minutes" | 0.593 / 0.468                    | "replace in-place counter increments with idempotent keyed writes" |
| p6 "a stored resource is constrained to never change its target after creation"      | 0.547 / 0.484                    | a retention/compaction lesson — related, not the same              |
| p4 "an optional custom alias that must stay globally unique"                         | 0.403 / 0.393                    | a signed-link-token lesson — noise                                 |

Against the store's own geometry (random pair p95 0.457, p99 0.532 on conditions), the whole-prompt
list is indistinguishable from noise and the good probes are clearly above it. Decomposing the goal
into conditions is what makes retrieval work at all; the prompt-as-query is the weakest list in the
fusion and it has the largest budget.

For an out-of-domain brief — a CI pipeline for a monorepo — the store still answered with 16
candidates: the cache-hit-rate probe scored **0.754** against "derive every capacity number from the
stated assumptions", the p95 probe 0.568 against the p99 lessons, and the CI-specific probes
(affected-package selection, flaky-test quarantine) 0.45–0.47 against lessons about recovery sweeps
and stochastic scoring — noise that reads plausibly. There is no floor, so the curator is handed all
sixteen and has to reject them one by one at four minutes a run.

---

## 7. Answers: recall

### 7.1 Is it recalling by vector similarity?

Yes, and only that: cosine over two named vectors per chunk (`condition`, `lesson`), several probes
per query, reciprocal-rank fusion. There is no lexical or hybrid search, no metadata filter, no
reranker other than the curating pipeline itself, and no score floor. The one non-vector input is
the curator's rules, which read `decision` off the payload.

### 7.2 Is the query built the way the use case needs?

Mostly yes, and the parts that are right are the hard parts:

- **Asymmetric registers are handled.** A goal is a situation and a lesson is an instruction; the
  store indexes the situation half separately and the probe persona writes probes in that register.
  This was measured into existence (`memory-runs.md` §6) and the live numbers above confirm it.
- **The query is decomposed** into one condition per demand by a model, not by the prompt's
  typography, with the goal kept as probe zero so nothing is lost.
- **Focused recall searches for the defects**, not the brief. For a coach revising a judged canvas,
  the lessons that matter are about what is wrong _now_; the focus lines do that, and the deriver is
  shown them so its probes name the situation producing each defect. Only two recalls have run this
  way so far; both kept lessons that cite `d1…d6` as what they serve.

Where it falls short of practice, in order of measured cost:

1. **No preference for the source domain**, though it is the strongest predictor (62% vs 24–31%).
   The payload index is there; a second probe set filtered to the target pipeline, fused with the
   unfiltered one, would use it without excluding cross-domain lessons.
2. **The budget favours the weakest list.** The goal probe gets 16 ranks and each derived probe 2 or
   3, yet the goal's list is noise-level for a short brief. Giving every probe the full limit and
   letting dedupe and fusion cut is cheap (one batch call either way) and `retrieval-report` can
   measure the difference before anything is changed.
3. **No floor.** The store's own geometry now gives one: a candidate whose best score against _any_
   probe is below the random-pair p99 (~0.53 on conditions) is indistinguishable from noise. A floor
   relative to each probe's distribution would have emptied the CI brief's list and halved the canvas
   brief's — and spared the curator those judgements.
4. **The artifact is not searched.** The probes come from the brief; the canvas itself (nodes, edges,
   bindings) reaches the search only through the focus lines' first critic sentence. A design with a
   single-consumer fan-in is a condition a stored lesson names, and nothing asks for it unless a critic
   already flagged it.
5. **No lexical channel.** Identifiers and numbers — Postgres, `ON CONFLICT`, 99.95% — are where
   embeddings blur and where lessons are most specific; a BM25 list fused alongside would catch them.

### 7.3 Are useful chunks selected for the next step?

The selection is careful and expensive. Three screens — fusion to 16, the curator to 8, the curator's
own critics to the usable subset — leave a median of 5 lessons with 92% precision and 98% fidelity.
Each is handed on with `serves` (which part of the goal it informs) and a `caveat` (how its context
differs), ranked by how many passing criteria cited it. For the coach that reaches the producer alone.

Two things weaken the hand-off. The producer reads the curator's **paraphrase** (`insight`), not the
stored lesson — a second compression after the digest's own. And nothing closes the loop: whether a
briefed lesson changed the revision is not recorded on either side. The four coach runs that have
recalled so far ended `escalate 57.8` three times (the revision produced no artifact) and `revise
64.4` once; with no paired control and n = 4 nothing can be read from that, and `memory-runs.md` §14
already found goal-injection inert at n = 15 on another pipeline. The experiment that would settle
it — the same brief coached with and without recall, read off `recall.lessons` and the next
iteration's ledger — is still the open item, and §4.4's first proposal is its continuous form.

### 7.4 How is "similar enough" decided, and will it converge or diverge?

Nothing numeric decides it. Fusion orders; the curator decides, reading the chunk against the query
and the rules, with no score in view. That is defensible — the measured score distributions are too
flat for a hand-set threshold — but it puts the entire discrimination burden on ten model calls per
recall, and the out-of-domain report shows the retriever will hand over sixteen plausible-sounding
mismatches whenever the store has nothing relevant.

Divergence risk, by path:

- **Coach path: bounded by construction.** Lessons reach the producer only, labelled advisory, and
  the judges grade against the prompt's criteria they never see lessons for. A bad lesson can cost a
  revision, not a grade. The focus steers toward lessons about _this_ design's confirmed defects,
  which is convergent by definition.
- **Orchestrator path: a real but unmeasured risk.** `withMemory` appends to the goal every stage
  reads. The lead forbids deriving criteria from it, but that is prose to a deriver; a remembered
  "state a latency budget for every hop" can become a criterion the brief never asked for. Nothing
  checks whether a target's derived criteria cite the appended section.
- **Self-recall.** The last live coach recall's three lessons all came from the _previous coach run of
  the same brief_ (`sourceRunId 2026-10-02T21-53-19`), digested minutes earlier. The loop is handing
  a design its own prior critique as a "lesson from earlier runs". Useful as working memory for one
  exercise; not cross-case generalisation, and the source of the near-duplicate cluster in §3.4.
- **Escalated sources.** Rule 3 lets a lesson from a `reject`/`escalate` iteration inform a risk only;
  71 drops cite it. Since the orchestrator stamps the _best iteration's_ decision, a run that
  escalated after a good first iteration still contributes recommendations — correct, and worth
  knowing.

Net: with the coach path as built, recall cannot pull a grade off the prompt's goal. It can waste the
producer's attention — 98% of lessons need a caveat, and half the query's needs are never served — and
it cannot yet show that it helps. The orchestrator path carries the divergence risk the coach path was
designed to avoid, and is the one to measure first if it is used for anything that is graded.

---

## 8. What to change, and in what order

> **One proposal below is superseded by what shipping it measured.** Row 5 asks the reader to "keep the
> earlier of a duplicate pair". Measured on 2026-10-03 against ten recorded digests: of eight
> `duplicate_memory` findings, three name **three** items, and in all three the rationale identifies a
> pair while the third is unrelated. The engine's `defectsOf` groups findings into connected components
> by shared evidence and unions their refs, so a "pair" finding is a _set_ and no keep-one rule can
> know which members are the duplication. `duplicate_item` therefore withholds nothing (`dc5c8fe`), and
> the same correction applies to `duplicate_memory` and `redundant_chunk`. Reinforcement, not a
> keep-one rule, is the defence against a twin.

Each item is an adapter, a definition field or a persona — the engine stays as it is. The first three
make the system able to measure itself; the rest act on what the measurements already show.

> **What has since been built** (2026-10-03). Seven of these twelve shipped as a new `knowledge`
> orchestrator and a new `knowledge-digest` pipeline, which sit beside the memory tier rather than
> changing it: `memory`, `experience-digest` and `memory-recall` behave exactly as this page describes
> them. The commits are `96e28a1` (contracts), `7b3c60a` (the `memory_support` table), `44e63f1` (the
> store's facets, probe filter, scoped replace and support counts), `aefdcdc` (the experience record
> moved into `core/outputs` so two pipelines reduce a run the same way), `5f95c52` (the pipeline),
> `0ca21e4` (the orchestrator), `ae4521a` (its HTTP spec) and `1a2fcc4` (the two reports).
>
> | #   | Change                                              | State                                                                                                                                                                                                              |
> | --- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
> | 1   | per-chunk usage                                     | **built as a read** — `GET /memory/effectiveness` joins each recalling run's lessons to what the engine said changed next, rather than writing a usage row                                                         |
> | 2   | keep the gaps                                       | **built** — `GET /memory/gaps`, grouped by the brief taken bare                                                                                                                                                    |
> | 3   | sweep the budget and a floor                        | not built; `retrieval-report` is unchanged and is still where it would be measured                                                                                                                                 |
> | 4   | prefer the same pipeline                            | **the seam is built** — `ProbeFilter` narrows by kind, pipeline and run, and the knowledge recall uses it; recall for a goal does not yet                                                                          |
> | 5   | stop a gap or a duplicate's survivor from excluding | **built** — each finding type declares `withholds` on its policy and each warning validator on itself; one rule in `core/outputs` reads both; the knowledge reader binds it rather than keeping a table of its own |
> | 6   | merge near-twins at write                           | **superseded** — an item that confirms a stored one is reinforcement by judgement rather than by cosine, which is the same goal without a threshold                                                                |
> | 7   | store `finding` chunks                              | **built** — one per confirmed finding of the judged iteration, from the ledger, with no model call                                                                                                                 |
> | 8   | facets on the payload                               | **built** — dimension, polarity, topics, criterion kinds, finding types, transition, grounding, severity, support, each derived and each optional                                                                  |
> | 9   | generalise `ChunkSource`                            | not built; `decision` and `iteration` still presume a judged run                                                                                                                                                   |
> | 10  | brief the producer with the stored text             | not built                                                                                                                                                                                                          |
> | 11  | a `pattern` criterion kind                          | **built as `held`** in the new pipeline; `experience-digest` is unchanged                                                                                                                                          |
> | 12  | check the orchestrator's injected criteria          | not built                                                                                                                                                                                                          |
>
> Two decisions worth recording. A **breadth cap** — a fault naming most of a digest excluding none of
> it — was proposed here, measured (10% of exclusions; §3.2), and then dropped: a fault that
> legitimately covers most of a chunk must still withhold, and a peer's run proved it by misattributing
> most of a résumé chunk's facts. The per-source `withholds` table recovers the same yield for the right
> reason. And the knowledge digest's own content rules **warn** rather than block, because at twelve
> items a blocking generality rule would refuse most first drafts.
> The
> table is the summary; §8.1–§8.12 explain each change in plain terms and walk it through a recorded
> run. **In every walk-through the "today" lines are real records, named by id. The "with the change"
> lines are what that same record would show once the change is in place — they are constructed, and
> say so.**

| #   | Change                                                                                                           | Why, from the numbers                                                                    | Where                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Record per-chunk usage: retrieved, kept, usable, briefed, and whether the focused defect resolved next iteration | the only route to a floor, pruning, and "does it help" (§7.3)                            | a usage row written by `readPack` and by the runs service after the next iteration                                                                                                                                                  |
| 2   | Keep the pack's `gaps`                                                                                           | 5 per recall, the exact list of what to learn next (§6.3)                                | store beside the recall run; surface in the inspector                                                                                                                                                                               |
| 3   | Measure budget and floor with `retrieval-report` sweeps over the recorded briefs                                 | the goal probe is noise-level with the largest budget; CI brief got 16 candidates (§6.4) | `probesOf` limit policy; a per-probe floor relative to the random-pair p99                                                                                                                                                          |
| 4   | Fuse a same-pipeline-filtered probe set with the unfiltered one                                                  | same-domain candidates are 2× as usable (§6.2); the index exists                         | `searchMany` filter on `pipeline`; no vocabulary change                                                                                                                                                                             |
| 5   | Stop `missed_signal` and both-of-a-pair `duplicate_memory` from excluding memories                               | about 80 of 269 exclusions are for a gap or for the copy meant to survive (§3.2)         | `endorsedMemories`: exclude on fault types only. **Half superseded 2026-10-03** — see §8.0: a duplicate finding names a SET, not a pair, so keeping "the earlier" drops a bystander; `duplicate_item` withholds nothing (`dc5c8fe`) |
| 6   | Merge near-twins at write                                                                                        | 7 pairs > 0.80, 2 > 0.90, all from re-coaching one brief (§3.4)                          | `replaceRunChunks` → search-then-upsert on the `lesson` vector                                                                                                                                                                      |
| 7   | Store `finding` chunks, model-free, beside lessons                                                               | the cap of 8 is binding in 83% of digests; focus lines search for defects (§4.4)         | `chunksOf` over the ledger; `kind: 'finding'` is already declared                                                                                                                                                                   |
| 8   | Add transition and finding/criterion facets to the payload                                                       | lets rules distinguish a proven fix from a standing risk; lets probes filter (§4.2)      | `toPayload`, indexed fields                                                                                                                                                                                                         |
| 9   | Generalise `ChunkSource` before document memory lands                                                            | a document fact has no `decision` or `iteration` (§4.2)                                  | `origin` with optional run fields; the curator's provenance line reads what is present                                                                                                                                              |
| 10  | Brief the coach producer with the stored text as well as the curator's insight                                   | the producer today reads a paraphrase of a paraphrase (§5.5)                             | `briefingOf`                                                                                                                                                                                                                        |
| 11  | A `pattern` criterion kind in the digest rubric                                                                  | 477 passing criteria unused; 29 of 386 chunks come from an accepted iteration (§3.3)     | `experience-digest` deriver persona and `criterionKinds`                                                                                                                                                                            |
| 12  | Check derived criteria against the appended memory section in the orchestrator path                              | the one place lessons can move a grade (§7.4)                                            | a validator on the target, or stop injecting into the goal                                                                                                                                                                          |

### 8.1 Record whether a recalled lesson did anything

**What it is.** Today a coach run writes down which lessons its producer was handed (`recall.json`)
and the engine writes down which defects resolved in the next iteration (`trace.lessons`). Nobody
joins the two. The change is one row per handed lesson, written when the next iteration is judged:
which chunk, which defect it was recalled for, and what happened to that defect. It records
association, not cause — one run cannot prove a lesson fixed anything — but across many runs it is
the only data from which "does memory help" can ever be read without a controlled experiment.

**Today**, the coach run that recalled on 2026-10-02 at 22:30, read from its row and its recall
record. The join below was made by hand for this page; nothing in the system makes it:

```text
coach run 2026-10-02T22-30-00 · system-design-canvas · recall: recalled 3 (recall run 2026-10-02T22-30-05)
  focus searched   d1 data_integrity (high) · d2 data_integrity (high) · d3 scale_mismatch (high) · d4 unhandled_failure (high)
                   d5 contradiction (medium) · d6 c5 fail · d7 c1 partial · d8 c2 partial
  producer handed  [m8] serves c5/d5 — the 30 ms cache-miss total omits the failed lookup     (from run 2026-10-02T21-53-19)
                   [m2] serves c1/d1 — create writes primary, write-through cache, replica fallback (from run 2026-10-02T21-53-19)
                   [m1] serves c6/d6 — replica swap does not close the redirect SPOF           (from run 2026-10-02T18-01-11)
  i1 adopted  revise 57.8   →   i2 revise 55.6   →   i3 revise 64.4
  engine lessons   resolved contradiction|binding.4,…   i1→i2        ← d5, the defect m8 was recalled for
                   resolved data_integrity|binding.1,…  i1→i2        ← d1, the defect m2 was recalled for
                   improved c5 fail → partial            i1→i2        ← d6, what m1 served …
                   regressed c5 partial → fail           i2→i3        … and it fell back a revision later
                   improved c1 partial → pass            i2→i3
```

**With the change**, the same run would also leave three usage rows (constructed):

```text
chunk 2026-10-02T21-53-19/memory.5   recalled · kept · usable · briefed   for d5 contradiction          → resolved next iteration
chunk 2026-10-02T21-53-19/memory.2   recalled · kept · usable · briefed   for d1 data_integrity         → resolved next iteration; c1 partial → partial
chunk 2026-10-02T18-01-11/memory.1   recalled · kept · usable · briefed   for d6 c5 fail                → partial next iteration, fail the one after
```

**Why it helps.** Summed over chunks, these rows give each lesson a track record: how often it is
retrieved, how often the curator keeps it, how often the defect it was recalled for resolved. That is
what a score floor, a pruning rule and a "this lesson has never helped" verdict all need, and it turns
the paired experiment `../pipelines/memory-runs.md` §15 asks for into something the system collects as
it runs.

### 8.2 Keep the pack's gaps

**What it is.** Every memory-recall run ends with the curator writing `gaps`: up to ten sentences
naming the needs of the query no candidate served. It is a schema field, and it is judged — the
coverage evaluator fails a gap when a dropped candidate could have served it, so a gap that stands is
a reasonably trustworthy statement that the store had nothing. It is written into the recall run's
artifact and read by nothing. The change is to record each gap against the brief it was asked for and
use the list: as a coverage measure that closes when a later lesson matches it, as one rule line in
the next digest of that brief so the digest producer knows what a future recall will ask for, and as
a visible wanted list.

**Today**, the four coach recalls for the link-shortener brief, oldest first, and what the digest of
the last coach run then stored:

```text
recall 2026-10-02T18-01-20   gap  "No candidate addresses how custom-alias uniqueness is guaranteed alongside system-generated codes (c1)"
recall 2026-10-02T18-58-38   gap  "No candidate addresses alias uniqueness enforcement (c5)"
recall 2026-10-02T21-53-36   gap  "No candidate addresses d7/c7: creating a short link with an optional custom alias"
recall 2026-10-02T22-30-05   gap  "No candidate addresses whether a marketer can create a short link with an optional custom alias (c7/d7)"
                             gap  "No candidate addresses basic redirect correctness (anyone opening a short link reaches its long URL)"

digest 2026-10-02T23-00-42 of coach run 2026-10-02T22-30-00 — stored 5 chunks, conditions:
  memory.1  "promotable hot-standby/replica failover with a cache+replica+primary read-fallback chain …"
  memory.2  "a synchronous, ack-required, retried dependency added onto a low-latency path like a redirect …"
  memory.3  "partition/consumer-parallelism counts or non-contention claims for an async counting pipeline …"
  memory.5  "the async ingestion/aggregation side of a click- or event-counting pipeline …"
  memory.6  "a monitoring node watches a multi-stage async pipeline … or a create endpoint is exposed over sync HTTP …"
```

The same gap was named four times in four hours, a full digest ran in between, and the store still
holds nothing about alias uniqueness. Nothing in the system knows that.

**With the change** (constructed):

```text
wanted  brief "Verify 100 — campaign link shortener"
        "custom alias uniqueness alongside system-generated codes"   named 4× (18:01 · 18:58 · 21:53 · 22:30)   open
        "redirect resolves a short key to its long URL"              named 2× (18:01 · 22:30)                   open

digest 2026-10-02T23-00-42 · ## Rules (appended by the orchestrator)
  - Earlier recalls for this brief found no stored lesson about: custom alias uniqueness alongside generated codes; redirect correctness.
```

**Why it helps.** The digest fills its cap of eight on judgement alone, and the store learns only from
the supply side — whatever the judges happened to find. The gaps are the demand side, measured on
every recall. Closing one is the first number that reads as _learning_ rather than accumulation, and a
digest producer that knows the standing gaps writes the lesson the next recall will ask for, while
its critics still hold it to the record's evidence.

**What the built report then measured, 2026-10-03.** `GET /memory/gaps` over the five recalls of this
brief returns one group with **eleven** standing gaps, every one of them named exactly once — although
at least four are the same need in different words: "alias uniqueness enforcement (c5)", "how
custom-alias uniqueness is guaranteed alongside system-generated codes", "whether a marketer can
create a short link with an optional custom alias", "creating a short link with an optional custom
alias". So the grouping by brief is right and the list is useful, and the "named 4×" above is what a
reader would want rather than what exact-text dedupe can give. Reading two wordings as one need takes
embeddings, which means a decision about writing rather than only reading; until then the per-gap
counts understate repetition and the group count does not.

### 8.3 Measure the budget and a floor before changing either

**What it is.** Two numbers in `probesOf` were chosen, not measured: the goal probe keeps the whole
candidate budget (16) while each derived probe gets `ceil(16 / texts)` ranks (3 with six probes, 2
with a focus), and there is no score below which a candidate is dropped. `retrieval-report` runs
probes, embeddings and the search with no pipeline, so both can be swept over the recorded briefs
against the curator's recorded verdicts before anything moves.

**Today**, the report for the link-shortener brief against the live store:

```text
[prompt]  whole brief, 682 chars      best 0.395   16th 0.330      ← inside the random-pair band (p50 0.302, p95 0.457)
[p1] "a redirect path must meet a p99 latency target under 50 ms"                    best 0.651
[p3] "a click-count metric is allowed to lag real time by a bounded number of minutes" best 0.593
[p6] "a stored resource is constrained to never change its target after creation"    best 0.547
[p5] "sized for tens of millions of stored links … stated average-to-peak throughput" best 0.502
[p2] "a monthly availability target expressed in nines"                               best 0.474
[p4] "an optional custom alias that must stay globally unique"                         best 0.403
fused: 16 candidates, 13 of them in the prompt's own list; 3 ranks per derived probe
  below a p95 floor (0.457):  m1 0.393 · m4 0.403 · m10 0.386 · m11 0.399 · m14 0.353 · m16 0.339      → 10 would remain
  below a p99 floor (0.532):  … plus m2 0.474 · m5 0.486 · m6 0.484 · m7 0.502 · m9 0.458 · m12 0.490 · m13 0.506   → 3 would remain
```

**With the change** (constructed, the choice the sweep would settle): every probe searched to the full
16, dedupe and fusion doing the cutting, and a floor at the p95 of the store's own random-pair
distribution. For this brief the curator would read ten candidates instead of sixteen, six of them
surfaced by a specific demand rather than by the brief's general shape; for the CI brief of §6.4 it
would read none of the sixteen it was handed.

**Why it helps.** The curator costs ten model calls and about four minutes, and 60% of what it reads
today it drops. Rank already predicts its verdict (41% usable in the top four, 17% in the bottom
four), so cutting the list from the bottom by a measured floor saves the curator's time without
hiding what it would have kept — and the sweep shows exactly how many kept chunks any floor would
have lost before it is set.

### 8.4 Prefer lessons from the same pipeline, without excluding the rest

**What it is.** A candidate digested from the same pipeline as the query is far more often usable
(62% against 24–31%, §6.2), and the payload already carries `pipeline` with a keyword index that
nothing filters on. The change is a second probe set with `filter: pipeline = <target pipeline>`,
fused with the unfiltered one. Cross-domain lessons still compete; same-domain ones are no longer
crowded out by the older, larger domains.

**Today**, the first coach recall, with each candidate's source and the curator's verdict:

```text
recall 2026-10-02T18-01-20 · 16 candidates
  m1  system-design-canvas  USABLE      m9   system-design  kept, then faulted
  m2  system-design-canvas  USABLE      m10  system-design  dropped
  m3  system-design         USABLE      m11  system-design  kept, then faulted
  m4  system-design         dropped     m12  system-design  dropped
  m5  system-design-canvas  USABLE      m13  system-design  dropped
  m6  system-design-canvas  USABLE      m14  system-design  dropped
  m7  system-design-canvas  USABLE      m15  agentic-design dropped
  m8  system-design         dropped     m16  system-design  dropped
  → canvas 5 of 5 usable · everything else 1 of 11
```

The store held about thirty canvas lessons at the time; five reached the curator because 350 older
lessons outnumbered them in every probe's list.

**With the change** (constructed): the same recall with a canvas-filtered probe set fused in would
offer roughly half its sixteen slots to canvas lessons, and the curator — which keeps at most eight —
would have twice as many of the kind it keeps to choose from.

**Why it helps.** It uses the strongest predictor the data has without a new field, a new model call,
or a hard partition that would stop a `system-design` lesson about Postgres partition keys from
reaching a canvas that needs it.

### 8.5 Exclude a memory for a fault in it, not for a gap or for being the kept copy

**What it is.** `endorsedMemories` drops every memory any confirmed finding is located at. Two finding
types do not mean "this memory is wrong". `missed_signal` means acted-on evidence was left unused — a
gap — and the persona says to locate it at the unused alias; 20 of 21 confirmed ones named a memory
as well. `duplicate_memory` means two memories teach one thing — the persona says to locate it at the
later one so the lesson is kept once; 42 of 43 named both. The change is in the reader: exclude on
fault types (`misattributed_evidence`, `unsupported_effect`, `run_specific`, `vague_insight`), keep the
earliest memory a duplicate finding names, and let `missed_signal` exclude nothing.

**Today**, two admitted digests:

```text
digest 2026-10-02T22-16-37 · accept 94.9 · 7 memories proposed, 5 stored
  duplicate_memory  at memory.6, memory.7   "memory.6 and memory.7 teach the identical lesson — a no-artifact, escalated iteration
                                              voids every prior per-criterion verdict rather than signalling a regression"
  → both excluded; the lesson is stored zero times, not once

digest 2026-09-09T04-39-38 · accept 94.8
  missed_signal     at memory.5, memory.8, r13, r17, r18, r19
  → memory.8 excluded: "These moves scored as passing and are worth reusing: pass an opaque input only as a template
    variable substituted into prompts so no component parses it …" — a lesson about what passed, dropped because
    four criteria elsewhere were left unused
```

**With the change** (constructed): the first digest stores 6 of 7, keeping memory.6; the second keeps
memory.5 and memory.8. Across the 90 admitted digests on disk, about 80 of the 269 exclusions would
not have happened.

**Why it helps.** It recovers roughly 30% of the lessons the digest's own judges endorsed, with no
loss of the exclusions that matter: a misattributed or run-specific memory is still removed, and a
duplicate is still stored once.

### 8.6 Merge a near-twin instead of adding one

**What it is.** The store dedupes on exact `contentHash` only. When the studio digests every settled
coach run and one brief is coached several times a day, the same lesson is learned in slightly
different words and stored as several points. `memory-runs.md` §11 held off a write-time rule because
no pair had reached 0.80; at 386 chunks seven have, two above 0.90. The change: before upserting a
chunk, search the `lesson` vector; above a measured threshold, add the new run and its evidence to the
standing point's provenance rather than creating a point.

**Today**:

```text
point  run 2026-10-02T18-58-32 · memory.5 · digest 2026-10-02T19-13-43 (19:13)
       "When summing a per-hop latency budget for a cache-miss/fallback path, include the cost of the failed lookup itself …"
point  run 2026-10-02T21-53-19 · memory.5 · digest 2026-10-02T22-16-37 (22:16)
       "When summing a per-hop latency budget for a cache-aside read's miss path, include the failed cache lookup itself as a hop …"
       cosine between the two lesson vectors: 0.943 — the same brief, coached three hours apart

recall 2026-10-02T22-30-05 — both reached the curator:
       KEEP m8  (the 22:16 copy)   serves c5/d5
       drop m6  "Near-duplicate of kept m8 on the same hop-budget omission; redundant"
```

**With the change** (constructed):

```text
point  "… include the failed cache lookup itself as a hop …"
       sources   2026-10-02T18-58-32/memory.5 (digest 19-13-43) · 2026-10-02T21-53-19/memory.5 (digest 22-16-37)
       evidence  contradiction|binding.4,…  ×2
       recall 2026-10-02T22-30-05 → one candidate slot, and the slot m6 took goes to a lesson the curator has not seen
```

**Why it helps.** Sixteen candidate slots are the whole budget; a twin costs one and costs the curator
a judgement it makes correctly every time. A merged point also carries _how often_ a lesson has been
learned, which is evidence of its own.

### 8.7 Store finding chunks beside lessons, with no model call

**What it is.** A lesson is the digest producer's synthesis, capped at eight per run, and 78 of 94
digests hit that cap. A confirmed finding is already established by the engine with no synthesis:
two critic samples agreed, the normaliser merged them, the ledger holds its type, severity,
locations, the criteria it weakened and the first critic sentence. A record carries a median of nine
findings and up to thirty-two; the eight lessons compress them. The change is a second chunk per
confirmed finding of the best iteration, written by `chunksOf` from the ledger alone: the defect as
the focus lines already phrase it, the statement of the criterion it weakened as its condition,
`kind: 'finding'`, the finding key as `ref`. The vocabulary has allowed it since the first design
(`CHUNK_KINDS`, `ChunkSource.ref`), and the curator persona already says to state an insight "in the
chunk's own terms — what was found, what failed, what was decided".

**Today**, the record digested from coach run `2026-10-02T21-53-19` and what the next coach run
searched for:

```text
record 2026-10-02T22-16-37 · 9 findings · 7 memories proposed · 5 stored
  - [f1] data_integrity · high · … · weakens r1, r2, r5, r10 · by critic.architecture, critic.scenarios · remediated · reconciled to r1
         — Create writes synchronously to the primary (edge.4) then write-through populates the cache (edge.3); if that cache
           populate fails or is later evicted, the only fallback for a redirect is the replica (…
  (f1 reaches the store only as part of memory.2's evidence, through the producer's words)

recall 2026-10-02T22-30-05 · focus
  - [d1] data integrity (high): Create writes synchronously to the primary (edge.4) then write-through populates the cache (edge.3); …
  (the same sentence — compared today against lesson conditions, a translation; it matched memory.2 from the same run)
```

**With the change** (constructed), f1 would also be a point of its own:

```text
chunk  kind finding · ref data_integrity|binding.1,binding.2,binding.5,edge.3,edge.4,edge.5,edge.6,node.3
       run 2026-10-02T21-53-19 · system-design-canvas · iteration 1 · revise · 2026-10-02
       condition  "A marketer creates a short link for a long URL, optionally with a custom alias. A short link never changes its target once created."   (r1, r10)
       lesson     "data integrity (high): Create writes synchronously to the primary then write-through populates the cache; if that populate
                   fails or is later evicted, the only fallback for a redirect is the replica …"
       facets     type data_integrity · severity high · remediated · reconciled r1 · lenses critic.architecture, critic.scenarios
```

**Why it helps.** Nothing past the cap is lost — every confirmed defect is retrievable. A focused
recall compares a defect sentence with defect sentences, the same register, instead of translating
into a lesson's condition. The type and severity are facets a probe can filter on. And it costs
embeddings only, which are cached. Two limits: a finding is a judge's observation, not a lesson, so the
curator should treat it as precedent or risk the way rule 3 already treats chunks from escalated
iterations; and volume rises about threefold with the same brief producing the same findings, so it
belongs together with §8.6 and a `kind` filter, or the sixteen slots fill with repeats.

### 8.8 Put the evidence facets on the point

**What it is.** A stored chunk carries its evidence as opaque refs — a finding key, a criterion id —
that nothing reads. The record the digest read knew each finding's type and whether it was resolved,
and each criterion's kind and whether it passed. Summarising those onto indexed payload fields costs
nothing at write time and gives both the curator's rules and the probes something to work with.

**Today**, one stored chunk and the record lines behind its evidence:

```text
point  run 2026-09-30T03-02-25 · memory.4 · digest 2026-10-02T05-39-33 · iteration 2 · revise
       "Giving a polling-only, access-constrained external dependency its own dedicated poller node … kept that constraint passing
        every iteration without regression … a durable store for its per-partition progress cursors and a stated replica/failover
        count, both raised once and fixed the very next iteration. Monitoring is a separate gap: … still unfixed when the run stopped."
       evidence   criterion c8 · finding data_integrity|… · finding unhandled_failure|… · finding operability_gap|…

the record it was digested from:
  - [r8]  constraint · The point-of-sale system only answers polling … — i1 pass → i2 pass → i3 pass
  - [f11] data_integrity · medium · … · seen i2 · remediated · reconciled to r1 · resolved i2→i3 (the finding did not recur)
  - [f14] unhandled_failure · medium · … · seen i2 · remediated · reconciled to r3 · resolved i2→i3 (the finding did not recur)
  - [f18] operability_gap · medium · … · seen i3 · remediated · reconciled to r3                 (still open when the run stopped)
```

**With the change** (constructed):

```text
       facets   criterionKinds [constraint] · findingTypes [data_integrity, unhandled_failure, operability_gap]
                transitions { resolved: 2, held: 1, open: 1 } · proven: true
```

**Why it helps.** The curator's rules can then say "a lesson whose evidence resolved is a fix; one
whose evidence persisted or stayed open is a risk" from data instead of from the prose of the lesson.
A focused recall whose defect is an `unhandled_failure` can run a probe filtered to lessons that rest
on one. And the `evidence` array stops being write-only.

### 8.9 Loosen the chunk's origin before documents arrive

**What it is.** `ChunkSource` is the memory-recall pipeline's input schema reused as the store's
payload, which is the right coupling for lessons: a stored chunk is a valid candidate with no
conversion. But it requires `decision` and `iteration`, which presume a judged run. The peer's
document digest (`document-digest.ts` in contracts, the untracked `memory-ingest` package) will store
résumé and notes facts into the same collection. The change is an `origin` with the run fields
optional and a document shape beside them, and a provenance line that prints what is present.

**Today** (constructed — the pipeline is not in this tree yet), what a résumé fact would have to say:

```text
source   runId "<ingest run>" · pipeline document-digest · kind lesson · ref memory.3 · decision accept · iteration 1 · when 2026-10-03
         ↑ a document was never judged, had no iteration, and "accept" is not a fact about it
```

**With the change** (constructed):

```text
origin   kind document · pipeline document-digest · title "Resume_a2.pdf" · subject "<the candidate>" · date 2024-06 · chunk 2 of 5 · ref memory.3
curator  ### [m4] fact · document "Resume_a2.pdf" · chunk 2 of 5 · dated 2024-06 · ref memory.3
```

**Why it helps.** Rule 3 ("a chunk whose iteration was decided reject or escalate may inform a risk,
never a recommendation") is meaningless for a document and would be evaluated against an invented
value. Declaring what kind of origin a chunk has keeps the first generalisation honest and lets the
form-memory recall filter to `kind: document` without a convention on the `pipeline` string.

### 8.10 Hand the producer the stored lesson, not only the paraphrase

**What it is.** `briefingOf` builds the producer's line from the curator's `insight`, `serves` and
`caveat`. The stored lesson text is in `recall.json` but never in the prompt. The producer therefore
reads the curator's restatement of the digest's restatement of the judges' finding.

**Today**, lesson m8 of coach run `2026-10-02T22-30-00`:

```text
what the producer read
  - [m8] When summing a cache-aside miss-path hop budget, the failed cache lookup itself must be included as a hop before the fallback
         read's latency is added; omitting it understates the real total against a stated p99 target. — serves: c5/d5 and c9 — binding.4's
         30ms cache-miss total omits the 5ms failed cache lookup (real total 35ms) against the p99<50ms target

what the store holds (recall.json only)
  "When summing a per-hop latency budget for a cache-aside read's miss path, include the failed cache lookup itself as a hop before adding
   the fallback read's latency, not just the fallback hop alone — omitting the failed lookup understates the real total against a stated
   p99 target. — applies when A canvas states separate hit-path and miss-path hop-budget totals for a cache-aside redirect or read flow."
```

Here the paraphrase is faithful and what is lost is the `applies when` clause. The curator's
`unsupported_insight` finding — 103 confirmed across 88 runs — is exactly the case where it is not.

**With the change** (constructed):

```text
  - [m8] <the stored lesson, verbatim> — serves: …; curator: <insight>; caveat: …
```

**Why it helps.** The producer gets the digest's words beside the curator's reading of them, and a
curator that over-reached is visible rather than authoritative. The bytes are small: lessons are a
median 525 characters.

### 8.11 Let the digest learn from what passed

**What it is.** The digest producer is asked for "what passed and why", but the deriver writes criteria
only for evidence the loop acted on or that moved, so no criterion ever demands a memory about a
criterion that passed. The result is that 477 of 1,713 criterion aliases went unused and 29 of 386
chunks come from an accepted iteration. The change is a third criterion kind, `pattern`, for a
criterion that passed in every iteration under a mechanism the artifact states, so the rubric grades
whether the digest accounted for it.

**Today**, the digest of coach run `2026-10-02T21-53-19`:

```text
digest 2026-10-02T22-16-37 · unused: r4, r7, r10
  - [r7]  scale · System must store 20 million links.                               — i1 pass → i2 unassessed
  - [r10] constraint · A short link never changes its target once created.           — i1 pass → i2 unassessed
  (no criterion asked about either, so no memory rests on them)
```

**With the change** (constructed):

```text
derived  c17 (pattern) · The digest must account for r10 passing in i1 under the mechanism the artifact states for it.
memory.8 on [r10, r5]  insight: "An insert-only mapping whose target never changes lets the cache be populated once at create and
                        never invalidated; the only consistency work left is the create-then-populate path itself."
                        applies when: "a stored record is constrained never to change one of its fields after creation"
```

**Why it helps.** Lessons today are 95% about defects, so recall can tell a producer what to avoid and
rarely what to do. A `pattern` criterion is the smallest change that makes positive evidence
gradeable; the attribution critic still holds the memory to the record.

### 8.12 Check what the orchestrator's injection does to the rubric

**What it is.** The memory orchestrator appends recalled lessons to the goal under
`## Remembered evidence (advisory)`, and every stage reads the goal — the deriver included. The lead
says no criterion may be derived from it, which is an instruction to a model and not a check. The
coach path avoids the problem by briefing the producer only. The change is either a validator on the
target run that flags a derived criterion whose demand appears in the appended section and nowhere in
the brief, or routing the orchestrator's lessons to the producer as the coach does.

**Today**, from the fifteen-run cycle in `memory-runs.md` §14 (real counts), and what an appended line
looks like:

```text
orchestration eval-corpus-builder · recall complete · injected 6 · target revise 59.0
goal as the deriver read it:
  … the brief …
  ## Remembered evidence (advisory)
  - [m3] lesson · run 2026-09-08T… · system-design · iteration 1 · decided revise · 2026-09-08 · ref memory.3:
    State a latency budget that accounts for every hop the request actually crosses …
```

Nothing records whether any of that target's derived criteria came from the six lines rather than
the brief.

**With the change** (constructed):

```text
validator remembered-evidence · warn
  c9 "The design must state a per-hop latency budget for the read path" — the brief states no latency target;
     the demand appears only under ## Remembered evidence (advisory)
```

**Why it helps.** This is the one path where a recalled lesson can move a grade, by becoming a
criterion the brief never asked for. A warning validator makes it visible in the record; briefing the
producer only, as the coach does, removes it.

---

## 9. Where to look

| Question                                                       | Where                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| did a run's lessons get stored                                 | `GET /orchestrations/:id` → `steps.digest.counts` (`memories`, `kept`) and `steps.store.reason`; `kept` vs `memories` is the admission rate                                                                                                                                      |
| what the digest read                                           | the digest run's `01-goal.md` in `static/runs/<digest run id>/`                                                                                                                                                                                                                  |
| why a memory was excluded                                      | the digest run's `04-iterations/<best>/ledger.json` → `findings[].locationRefs` naming `memory.N`                                                                                                                                                                                |
| what is in the store                                           | `docker exec sysdesign-db psql -U admin -d sysdesign -c 'select count(*) from "vec_quality_memory__v2__text_embedding_3_small__1536"'` for the count, `POST /memory/retrieval-report { goal }` for what a goal would find; a row's `payload->'keys'` holds the two indexed texts |
| what a recall would find, and why                              | `POST /memory/retrieval-report { goal }` — every probe's own ranking beside the fused list                                                                                                                                                                                       |
| what a coach producer was handed                               | the coach run's `recall.json`, and `# Lessons from earlier runs (advisory)` in its `05-llm/*.producer.*.user.txt`                                                                                                                                                                |
| what the curator dropped and why, and what it said was missing | the recall run's `04-iterations/<best>/artifact.json` → `dropped[]`, `gaps[]`                                                                                                                                                                                                    |
| re-embed after an index change                                 | `POST /memory/:orchestrationRunId/reindex` — never re-digest for this                                                                                                                                                                                                            |
