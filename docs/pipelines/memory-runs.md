# Memory runs: four pipelines behind one endpoint, and what the recent runs showed

How the quality loop learned to read its own past. The step semantics, the
closed reason vocabulary, the dump layout and the guarantees are owned by
[`../pipeline-best-practices/quality-loop.md`](../pipeline-best-practices/quality-loop.md);
this page sits one level above it and adds what that file does not carry — why
the composition has the shape it has, how to operate it, and what the live
runs actually showed. For the five pipelines the rest of the app runs, see
[`./overview.md`](./overview.md) beside this file.

Two facts organise everything below:

1. **The engine never changed.** `core/` has not been edited for any of this.
   The composition is a module beside the pipelines (`src/modules/memory/`),
   and what the two memory pipelines have gained since — a probe list in the
   recall query, an alias space for it, a gated `run_specific` — lives inside
   their own folders, which is exactly what being an instance of
   `PipelineDefinition` is for. The edits to existing code elsewhere number
   five: exporting `RunsService` and `QUALITY_LOOP_LLM` from `RunsModule`, one
   optional callback on `RunsService.execute`, a module import, and
   `enableShutdownHooks()`. That is why the composition cost six _endpoints_
   and no new pipeline. A fourth was registered later — `agentic-design`, §1.1
   — for a reason that has nothing to do with memory: a second judging domain.
   It, too, left `core/` untouched.
2. **The producer only ever sees the goal.** `core/stages/llm-producer.ts`
   assembles `# Goal` and `# Success criteria` and nothing else. Every design
   decision below follows from that one fact: the input codecs, the advisory
   section appended to the goal, the byte budget, and aliases used as engine
   location ids. The curator is reached the same way — the conditions a search
   ran under arrive inside its goal as a `## Retrieved under` list. The one
   model call in a memory run that is not a pipeline stage is the probe
   derivation, which has no `quality_run` row and surfaces only as
   `counts.probes`.

---

## 1. The four, at a glance

All four are instances of one `PipelineDefinition`, declared as data under
`packages/quality-loop/src/pipelines/`, registered by one line each in
`index.ts`. Any of them can be a memory run's target; two of them also play a
role inside one.

| Pipeline            | Role in a memory run              | What it judges                                                         | Gates acceptance                                              | Loop         |
| ------------------- | --------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ------------ |
| `system-design`     | the default target                | a design answer against criteria derived from the prompt               | `constraint` kind, `constraint_violation`                     | 3 iterations |
| `agentic-design`    | a target, when asked for          | a workflow of agents, tools and rules — coverage, hand-offs, soundness | `constraint` kind, `constraint_violation`, `leaky_generality` | 3 iterations |
| `memory-recall`     | step 1 — curates recalled chunks  | which chunks serve the query, and whether each insight is in its chunk | `admissibility` kind, `no_usable_memory`                      | 2 iterations |
| `experience-digest` | step 3 — distils the finished run | which evidence the record shows moved quality, stated to transfer      | `misattributed_evidence`, `run_specific`                      | 2 iterations |

The two memory pipelines share a policy shape: `minHits: 2` on every lens, so
a gated finding needs both samples of a critic to agree before it blocks;
`acceptAt: 75`; `rejectBelow: 30`. `memory-recall/definition.ts:131-133` and
`experience-digest/definition.ts:157-159` say why.

`run_specific` gates for a reason worth stating, because it is the only place
the loop refuses a memory outright on the grounds of reuse. Pricing it cannot
work: `reuse` carries .30 and its penalty caps at 60, so a digest whose every
memory holds only for this run's names still scores 0.4 × 100 + 0.3 × 100 +
0.3 × 40 = 82, over the bar. Vagueness and duplication stay priced, because a
reader loses little to either; a lesson that cannot leave its own run is the
one failure a later prompt cannot recover from.

`system-design` is only the default target. `POST /memory-runs` takes a
`pipeline` like `POST /runs` does, and the module refuses only the two memory
roles as targets. The digest is target-agnostic by construction: `fromRun`
reads `contract.criteria`, the iteration ledgers, `selectedRemediations` and
`trace.lessons` — engine facts every pipeline produces — so a fourth pipeline
becomes digestible the day it is registered, with no change here. That claim
has since been cashed: `agentic-design` was added as a folder and one line in
`index.ts`, and the digest needed nothing.

**A declared weight is not an earned one.** Worth stating once, because the
policy tables read as though every dimension is scored the same way. A
dimension earns from the criterion kinds mapped to it, and loses from the
finding types mapped to it. Where no kind is mapped, the dimension can only
ever start at 100 and fall:

| Pipeline            | Earns from criteria                          | Penalty-only                |
| ------------------- | -------------------------------------------- | --------------------------- |
| `system-design`     | completeness, quality_attributes, compliance | soundness (.20)             |
| `agentic-design`    | all four                                     | none — deliberately         |
| `memory-recall`     | coverage, fidelity                           | precision (.25)             |
| `experience-digest` | attribution                                  | fidelity (.30), reuse (.30) |

A dimension with neither criteria nor findings is `null` and renormalises out,
so the divisor is the weight actually assessed. Both live scores fall straight
out of that: recall `bc5085` scored coverage 66.7 and fidelity 100 with
precision untouched, giving (66.7 × .40 + 100 × .35) / .75 = **82.2**; digest
`bb3c39` scored attribution 92 and fidelity 96.7 with reuse untouched, giving
(92 × .40 + 96.7 × .30) / .70 = **94.0**. It also explains a pattern visible in
every `system-design` run recorded in §8: soundness sits at 40 while coverage
sits at 100, because soundness has no criteria to earn from and the critics
only ever subtract from it. Not 40 on average — 40 exactly, in every run of a
nine-hour experiment, because that is where `maxPerDimension: 60` stops the
subtraction. A dimension pinned to its own floor carries .20 of the weight and
none of the information. `agentic-design` maps a criterion kind to every
dimension it declares, and `definition.spec.ts` asserts that property rather
than the arithmetic that follows from it.

---

### 1.1 `agentic-design`, and why a second judge rather than a generic one

`system-design` reads every brief as a distributed-systems problem, and the
bias is structural rather than a matter of tone. Three places carry it:
`scale` is one of its four criterion kinds — _"a stated load, volume or
retention figure the design must be sized for"_ — so the deriver hunts for
throughput targets in briefs that state none; `scale_mismatch` is a finding
type priced onto `quality_attributes`, which carries .30; and
`evaluator.quality.md` names capacity estimates as the evidence it cites for a
pass. `output.ts` makes `capacity` a mandatory key. An empty array parses, so
this is not schema-forced — it is policy-forced, which is worse, because it is
invisible.

The store measured it. Against a 97-lesson corpus built entirely by
`system-design`, the ten agentic prompts reached a mean best match of
**0.4986** — below even the held-out control at 0.5191, and far below the
contributing prompts at ~0.70. A corpus grown by one judge had almost nothing
an agentic brief could use.

Three ways out were considered: make one pipeline generic over the problem,
re-aim `system-design` at agentic work, or add a second judge. The second was
chosen. `system-design` stays sharp for the ten briefs that genuinely do state
p99 and availability targets, and `agentic-design` sits beside it — a folder
and one line in `index.ts`, which is what open/closed means when criterion
kinds, finding types and dimensions are open `Record<string, …>` in core. The
cost, accepted knowingly, is two rubrics to maintain and a routing decision
about which prompt uses which. Nothing routes automatically today: the caller
names the pipeline, as it always has.

**The vocabulary.** Four kinds, domain-neutral, with hand-offs first-class:

| kind         | meaning                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `capability` | Something the workflow must be able to do.                                                                             |
| `contract`   | An interface between two roles — what one hands the next, and what the receiver may assume, including on failure.      |
| `property`   | A property the design must hold rather than a thing it must do: determinism, auditability, degradation, extensibility. |
| `constraint` | A hard rule the design may not break. Gated.                                                                           |

Nine finding types. Five are inherited unchanged because they were already
domain-neutral (`missing_requirement`, `constraint_violation`, `contradiction`,
`unsupported_claim`, `unhandled_failure`); the four new ones are the point.
`contract_mismatch` — what one role produces does not satisfy what the next
consumes, or a hand-off names no producer or no consumer. `sequence_gap` — a
step whose precondition no earlier step establishes. `authority_leak` — a
model output decides an outcome the design says is decided by rules.
`leaky_generality` — a mechanism that works only for the shape of input this
brief describes.

`leaky_generality` gates, alone among the reuse-shaped failures, on the same
argument that gates `run_specific` in the digest: it is the one defect a
later, unanticipated input cannot recover from, and every one of the ten
agentic briefs asks explicitly for the opposite. `minHits: 2` with `samples: 2`
everywhere means both samples of a critic must agree before it blocks.

**The policy.**

| dimension      | weight | earns from           | loses to                                                                                                |
| -------------- | ------ | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `completeness` | .30    | `capability`         | `missing_requirement`                                                                                   |
| `interfaces`   | .30    | `contract`           | `contract_mismatch`, `sequence_gap`                                                                     |
| `compliance`   | .15    | `constraint` (gated) | `constraint_violation` (gated)                                                                          |
| `soundness`    | .25    | `property`           | `contradiction`, `unsupported_claim`, `unhandled_failure`, `authority_leak`, `leaky_generality` (gated) |

**The artifact.** `output.ts` is a `z.strictObject` with `summary`,
`assumptions`, `roles`, `contracts`, `flows`, `policies`, `memory`,
`extensibility`, `tradeoffs` and `risks`. There is no `capacity` section, and
nothing replaces it. `roles` declare what they `consume` and `produce` while
`contracts` declare the edges between them, and that redundancy is deliberate:
it is what makes "A's output does not fit B's input" a defect a critic can
point at. The current shape cannot express that at all, because contracts are
not modelled.

No lens demands a section. Whether `memory` or `policies` is judged depends on
whether the brief produced criteria of that kind; an unjudged dimension comes
back `null` and renormalises out, which the engine already does. That is the
genericity the ten prompts ask designs to have, applied to the judge.

**Not yet validated.** The weights, `acceptAt: 75`, `rejectBelow: 30` and
`minHits: 2` are starting values carried over from `system-design` and
reasoned about, not calibrated against live runs. No `agentic-design` run had
been executed at the time of writing: the experiment held the service at an
older build, and rebuilding mid-experiment would have changed the pipeline
under a running measurement. Treat every number in this subsection as a
hypothesis.

---

## 2. The shape of a memory run

```
POST /memory-runs ──► MemoryService.open ──► memory_run row ──► 202 { memoryRunId }
{pipeline, goal,             │                                    (poll GET /memory-runs/:id)
 output?, maxIterations?}    │
                             │  1 recall   goal head ──► probes ──► 1 + up to 6 texts
                             │                │                            │
                             │                │        memory_embedding (cache) ──► one batch
                             │                │                            │
                             │                │        14 searches (7 texts × 2 named vectors)
                             │                │        in one queryBatch ──► fuse (reciprocal rank)
                             │                │                            │
                             │                └──► memory-recall run ◄── up to 16 candidates ┘
                             │                          │
                             │                          └─► kept, unfaulted, ranked ──┐
                             │                                                        │
                             │  2 target   goal + "## Remembered evidence (advisory)" ◄┘
                             │                └──► the requested pipeline's run ──┐
                             │                                                    │
                             │  3 digest   fromRun(bare prompt) ◄──────────────────┘
                             │                └──► experience-digest run ──┐
                             │                                             │
                             │  4 store    admitted memories, unfaulted ◄──┘
                             │                └──► Qdrant upsert, one point per memory,
                             │                     carrying a condition and a lesson vector
                             │
                             └──► each step's status, reason, counts and child run id ──► memory_run.steps
```

Each of the three children is an **ordinary quality run**: its own
`quality_run` row, its own dump under `static/runs/` with kind `quality`, and
its own page at `GET /runs/:id` in the web client. The memory run adds only
what exists nowhere else — the step ledger, the availability it saw, and the
linkage.

The probe derivation is the exception and the only one: a fourth model call,
made through the same `LlmClient` the loop chose at boot, that is not a child
run. It has no `quality_run` row, no dump and no page, and appears in the
record only as `counts.probes` on the recall step. That is deliberate — its
output is never trusted, only used to decide which candidates get offered to
the pipeline that does the judging — but it does mean a memory run costs one
more exchange than its three children account for.

Recall is advisory: no outcome of step 1 stops step 2. The target is the
deliverable; its failure ends the run and skips steps 3 and 4 with
`target-failed`.

---

## 3. What the two new pipelines added

Both pipelines needed the model to see more than a prompt — candidate chunks
in one case, a whole finished run in the other. Fact 2 says there is no
channel for that but the goal. So each folder owns four things beyond the
three `quality-loop.md` describes, and the pattern is the reusable part of
this work.

- `input.ts` — **the codec.** A zod-typed input, `renderGoal(input)` writing
  the goal markdown, and `readIndex(goal)` reading back a fenced JSON block
  under a final `## Index` heading. The flexible markdown (the query prompt,
  or a past run's own goal) is embedded verbatim under its own heading, so any
  prompt works. `renderGoal` assigns the aliases; `readIndex` is the only way
  anything reads them back. No rule anywhere parses prose.
- **Two alias spaces, and only one is an id.** The recall query has since
  gained a `probes` array and a `matched` list on each candidate, so
  `renderGoal` now assigns `m1…m16` for candidates and `p1…p6` for the
  conditions a search ran under, printing the latter once under
  `## Retrieved under` and citing them per candidate. The `m` aliases are in
  the index and are location ids; the `p` aliases are written and never read
  back — no validator, no `locate`, no readback path touches them. That is
  intentional. A probe alias is provenance for a human and a hint for the
  curator, and the pack never cites one, so nothing would be served by making
  it addressable.
- `validators.ts` — **the exact checks.** `references` and `limits`, both
  `gate: 'block'`: an alias the index does not hold, an alias given two
  verdicts, an item left without one, a pack or digest over its limit. Both
  start with `contract.output.schema.safeParse`, because the engine runs every
  validator on any non-null artifact before it computes the block flag
  (`core/run-pipeline.ts`).
- **Aliases as location ids.** `locate` returns the candidate's alias (`m3`,
  `f4`, `r2`) rather than a position. A finding's identity is
  `${type}|${sorted locationRefs}` (`core/normalize.ts`), so an alias keeps a
  finding's key stable across a revision, makes cross-iteration lessons
  comparable, and lets the orchestrator map a finding straight back to its
  source. Free-text items stay positional (`gap.N`, `memory.N`).
- **The schema is the byte budget.** `memoryQuerySchema` and
  `experienceRecordSchema` each carry a `.refine` asserting that
  `renderGoal(x)` fits `GOAL_MAX_BYTES` (64,000). Without it a composed goal
  would be clipped by `goalSection` for the model while the validators read
  the whole thing. `experience-digest/compose.ts` exports `fit`, which trims
  in a fixed order — artifact, prompt, trailing findings, trailing criteria —
  and counts what it dropped under `omitted`.

One rule constrained both vocabularies: **criteria are derived from the
goal**, under the engine's own instruction never to invent a requirement the
goal does not support. So a kind must name something the goal states — `need`
and `admissibility` are in the query; `signal` and `transition` are in the
record. Standing rules that are not in any goal became finding types instead
(`unsupported_insight`, `misattributed_evidence`) or validators.

---

## 4. The composing module

`packages/quality-loop/src/modules/memory/`. Six routes, hand-built
envelopes, inline `ZodValidationPipe`, the same conventions as
`runs.controller.ts`.

| Verb   | Path                            | Code | Body / query                  | Answers                                 |
| ------ | ------------------------------- | ---- | ----------------------------- | --------------------------------------- |
| `POST` | `/memory-runs`                  | 202  | the shared `runRequestSchema` | `{ data: { memoryRunId, status } }`     |
| `POST` | `/memory-runs/digest`           | 202  | `{ runId }`                   | the same                                |
| `POST` | `/memory-runs/:id/reindex`      | 200  | —                             | `{ data: MemoryStepDto }`               |
| `POST` | `/memory-runs/retrieval-report` | 200  | `{ goal }`, up to 64,000 B    | `{ data: RetrievalReportDto }`          |
| `GET`  | `/memory-runs`                  | 200  | the shared list query         | `{ data, meta }`, newest first          |
| `GET`  | `/memory-runs/:id`              | 200  | —                             | `{ data: MemoryRunDto }`, 404 otherwise |

The body of a memory run is **exactly** the body of a quality run. `output`
and `maxIterations` reach the target only; recall and digest run on their own
policy loop, which the DTO comment states.

The last two are the odd ones out and are the only synchronous routes: they
run **no pipeline at all**, so they take neither `output` nor `maxIterations`
and answer 200 rather than 202. `reindex` re-embeds a memory run's lessons
from the digest artifact it already produced, which is what makes a generation
bump survivable (§6). `retrieval-report` answers what a recall _would_ retrieve
for a goal — the probes derived, each probe's own ranking, and the fused list —
without running one, so a corpus can be swept cheaply.

Guards, before any row exists: a pipeline not in `RunsService.list()` is a 404,
the same as `POST /runs`; either memory role as the target is a 400
(`memory.service.ts:233-240`); an unknown source run for a digest is a 404
(`:124`); an id that is not a uuid answers 404 rather than raising a database
error (`:105-107`). The two new routes add four more: an unknown memory run is
a 404, a memory run that digested nothing is a 400, a child run that is no
longer stored is a 404, and embeddings being off or unavailable is a 400.

**The record.** `memory_run` (uuid primary key) holds the target pipeline, the
status, the bare request summary, the embedding and store availability the run
saw at open, the step ledger as jsonb, and three nullable references to
`quality_run` with `on delete set null`. `memory_embedding` beside it is the
cache. Both come from one migration.

**The ledger.** `StepLedger` (`steps.ts:80`) mutates the record in memory and
chains every flush onto one serial promise, so writes land in order and a
failed flush is logged rather than thrown — the record in memory is the truth
and `close()` writes it whole. Writes after `open` are guarded by `status:
'running'`, so a late flush never resurrects a row the boot sweep already
failed.

**The sweep.** `MemoryService.onModuleInit` fails every row still `running`
from a dead process, closing its steps through the same `closeSteps` the error
path uses, then verifies the store and logs what it found.

---

## 5. Every closed reason, and what it means

`MEMORY_STEP_REASONS` (in contracts) is closed at sixteen values, so a client
maps a tone rather than parsing prose. A step is `pending`, `running`,
`complete`, `skipped` or `failed`; `complete` with a reason means the step ran
and had no effect. This is the whole failure map.

| Reason                 | Raised when                                                                      | What to do                                                          |
| ---------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `embeddings-disabled`  | recall, digest, store — no `OPENAI_API_KEY`, or the loop is pinned deterministic | put the key in `.env`; the target still ran                         |
| `store-unavailable`    | recall, store — `verify()` said not ready, or a call threw                       | `pnpm stack:db`; the row's `store.note` carries the cause           |
| `store-empty`          | recall — the collection holds nothing, or the fused list came back empty         | seed past runs, or re-index them if the generation moved (§6)       |
| `embedding-failed`     | recall, store — the provider returned nothing after one retry                    | check the `llm: embeddings request failed` line for status and body |
| `pipeline-unavailable` | recall, digest — the role's id is not registered                                 | the registry lost an entry, or a spec overrode it                   |
| `run-failed`           | any step whose child run ended `failed`                                          | read the child at `GET /runs/:id`; `note` carries its message       |
| `not-accepted`         | recall, digest — `admits()` said no: a gate failed, or the score missed the bar  | read the child; the name predates the rule and now means unadmitted |
| `no-usable-memory`     | recall — admitted, but nothing survived: no kept chunk, or a finding names each  | the pack faulted itself; better memory has to be stored first       |
| `goal-at-budget`       | recall — the goal alone already fills the 64,000-byte budget                     | shorten the prompt if memory matters more than its tail             |
| `provided-run`         | recall, target of a digest-only run                                              | expected; the target already happened                               |
| `target-failed`        | digest, store — the target run failed                                            | fix the target, then `POST /memory-runs/digest` for the other half  |
| `nothing-to-digest`    | digest, store — the source run has no trace                                      | it never produced one; nothing to learn                             |
| `digest-failed`        | store — the digest run failed                                                    | as `run-failed`                                                     |
| `no-memories`          | digest, store — admitted, but a finding names every memory                       | the digest faulted its own proposals                                |
| `interrupted`          | any step, at boot — the process died mid-run                                     | re-run; completed children are still persisted                      |
| `errored`              | any step — an unexpected throw closed the run                                    | `note` carries the message; this one is a bug                       |

Two shapes are worth naming. **`skipped` is not failure** — the whole memory
half is optional, and a run whose four steps read `embeddings-disabled` still
produced its answer.

And **`not-accepted` no longer means what its name says.** The rule it reports
is `admits()` (`compose.ts:99-115`), and an `accept` is only one of the ways
past it. A run is drawn on when its best iteration cleared `artifactPresent`,
`validatorsPassed` and `evidenceSufficient` and scored at or above that
pipeline's own `acceptAt`. `policyAllowed` is deliberately **not** required,
because it goes false the moment any blocker is open anywhere — and the item
that blocker names is excluded on its own, one by one, as it always was. The
case that forced this is in §8: a digest scored 94 with one open finding
against its _summary_, which is never stored, and eight clean memories were
thrown away with it. Item-level judgement is honoured; a whole run is no longer
withheld because the iteration budget ran out before someone else's blocker
closed. The reason keeps its name because the vocabulary is closed at sixteen
values and renaming one would break every client that maps it.

---

## 6. The vector store and the embeddings port

Qdrant, as a `docker-compose` service named `vectors`, started, waited for and
stopped alongside Postgres by `scripts/stack.sh`. It is bound to `127.0.0.1`
with telemetry off and keeps its data in the named volume `sysdesign-qdrant`.
The image ships no shell, so readiness is gated from the host on `/readyz`
rather than by a compose healthcheck.

The adapter is `qdrant/qdrant-memory-store.ts` behind the `MemoryStore` port,
so the module never imports the client directly:

- **One collection per generation, model and width**,
  `quality-memory__<generation>__<model>__<dimensions>`, cosine distance,
  created on first use. The generation is `INDEX_GENERATION` in
  `qdrant/collection.ts`, currently `v2`. What is embedded belongs in the
  collection's identity exactly as the model and the width do: cosines across
  generations are not comparable, and one collection ranking two
  representations against one query means nothing. Bump it whenever the
  indexed text changes. The old rows are then unreachable — and the way back
  is **re-indexing, not re-digesting**. Re-digesting asks a model to derive the
  lessons afresh, and `replaceRunChunks` deletes a run's chunks before it
  writes, so a replay that answers differently destroys exactly what it was
  meant to migrate. `POST /memory-runs/:id/reindex` re-embeds the digest
  artifact that is already stored, which is deterministic.
- **Two named vectors per point**, `condition` and `lesson`. A stored memory
  is two halves the digest already separates: `appliesWhen`, a situation, and
  `insight`, an instruction. A goal is a situation too, so it belongs against
  the first and not the second. This was measured, not assumed — see below.
  One point still holds one lesson, so `pointId`, `contentHash` and the dedupe
  all keep their meaning; only the vector count changed. The payload records
  the texts it was indexed by under `keys`, so the store describes itself.
- **The query is probes, not the prompt.** `QueryProbes` turns the goal into
  up to six short, condition-shaped statements through the same `LlmClient`
  the loop chose at boot, with the persona in `probes.md`. The goal itself is
  always probe zero, so every candidate a bare search would have found is in
  the pool fusion ranks — the ordering can still differ, but nothing is lost
  before it — and a model that refuses, errors or is disabled costs exactly
  the probes and nothing else. Probes are never derived from the prompt's
  typography: splitting on blank lines or headings is a rule that parses prose
  the module did not write, and on this repo's own prompts it yields as many
  bare section headings as content.
- **Reciprocal-rank fusion** over the resulting lists, `RRF_K = 60`. Rank-based
  on purpose: the lists answer different questions against different named
  vectors, so their scores are not on one scale, and whichever probe happened
  to score high would otherwise decide the whole list. The goal's probe keeps
  the full candidate budget and the derived conditions share it, so widening
  the search does not multiply what comes back through a five-second timeout.
- **A deterministic point id**, `sha256(sourceRunId|ref)` reshaped as a uuid,
  so the same memory always lands on the same point and re-digesting a run
  replaces its chunks rather than duplicating them. `replaceRunChunks` deletes
  by `runId` and upserts, both with `wait: true`, so a memory just stored is
  searchable by the next run.
- **Dedupe on read, twice.** Each search over-fetches three times its limit and
  keeps the best-scoring chunk per `contentHash`; `fuse` then dedupes again
  across probes, keeping the best-scoring copy. So the same lesson learned from
  repeated runs of one prompt is one candidate, however many probes found it.
- **Availability is data.** `verify()` never throws: it answers `{ ready,
reason, note, model, collection, chunks }`, which is logged at boot and
  stamped on every memory run. A down store is a skipped step with a stated
  cause, never a 503 and never a failed boot.

Embeddings are a port beside the LLM client in `packages/llm`:
`EmbeddingClient` with `enabled`, `model`, `dimensions` and one `embed` method
that answers `null` on any failure, exactly as `LlmClient` does. The OpenAI
adapter batches at the provider's ceiling of 100 inputs, always sends
`dimensions` so any `text-embedding-3` model fits the collection, retries a
rate limit once honouring `retry-after`, bounds every request at 30 seconds,
and refuses a vector of the wrong width rather than storing a corrupt row. Its
transport and clock are injectable, which is how the specs cover all of that
without a network.

`CachedEmbeddings` puts a Postgres table in front of it, keyed by model and
the sha256 of the exact text, so a prompt is embedded once per model across
processes and identical lesson texts once. `counts.embedded` on the store step
reports how many texts actually reached the provider — against a doubled
denominator now, since a chunk is indexed twice.

The cache is an optimisation and never a dependency. A database that cannot
answer degrades to a provider call and one that cannot record degrades to
embedding the same text again next time; only the provider itself returning
nothing is a `null`. That distinction is load-bearing: the cache used to be
able to _throw_, and a throw in recall failed the whole memory run, so the
target never ran at all — memory taking down the answer it was supposed to
help.

**The measurement that produced all of this.** The first store held six
lessons, and the vectors were there to be read. Against the prompt they came
from, query-document cosine ran 0.2537 to 0.3586 — while the lessons sat at
0.396 from _each other_. The documents were closer to one another than any was
to the query, which is what asymmetric retrieval looks like: a prompt is a
problem statement and a lesson is an instruction, and they occupy different
regions. The proof was that the lesson about never summing medians for a p99
ranked **last** for a prompt whose own table states a p99 target across a hop
it does not control. Indexing the condition instead lifted the spread from
0.105 to 0.187; asking per-condition probes lifted the best score to **0.7155**,
double anything the whole prompt ever managed, and the p99 lesson ranks first
under the probe about freshness. Fusion is the part still to prove: with a
corpus this small every probe returns the whole store, so RRF averages complete
lists and washes out the sharp per-probe signal. Ranking only begins to matter
above about forty-eight chunks. There is deliberately **no score floor** —
`retrieval-report` exists so one can be set from evidence rather than guessed.

---

## 7. Operating it

```bash
# the stack: Postgres on 5433 and Qdrant on 6333, started and stopped together
pnpm stack:db
pnpm db:migrate
pnpm stack:down                                  # both, data stays in the named volumes

# the service; Node loads .env, which is where OPENAI_API_KEY lives.
# QUALITY_LOOP_AUTH is NOT in .env and NOT in any pnpm script, and without it
# the loop degrades silently: every run "completes" in ~30s with no exchanges,
# overall 0 and finalDecision escalate. Only GET /runs/<id>.llm says why —
# {"enabled": false, "reason": "no-key"}. DB_PORT fails loudly; this fails quietly.
env DB_PORT=5433 QUALITY_LOOP_AUTH=claude-code \
  node --env-file-if-exists=.env packages/quality-loop/dist/main.js

# a memory run: the same body as POST /runs
curl -s -X POST localhost:3003/memory-runs -H 'content-type: application/json' \
  -d '{"pipeline":"system-design","goal":"# Prompt …","maxIterations":1}'   # 202 { memoryRunId }
curl -s localhost:3003/memory-runs/<memoryRunId>       # poll; the ledger updates live
curl -s 'localhost:3003/memory-runs?limit=10'          # newest first, with meta

# seed memory from runs that already happened, one call each
curl -s "localhost:3003/runs?pipeline=system-design" | jq -r '.data[].runId' | while read -r id; do
  curl -s -X POST localhost:3003/memory-runs/digest -H 'content-type: application/json' \
    -d "{\"runId\":\"$id\"}"
done

# after a generation bump: re-embed what a memory run already digested.
# never re-digest for this — a replay deletes before it writes.
curl -s -X POST localhost:3003/memory-runs/<memoryRunId>/reindex   # 200 { chunks, embedded }

# what a recall would retrieve for a goal, without running one:
# every probe, its own ranking, and the fused list. the calibration tool.
curl -s -X POST localhost:3003/memory-runs/retrieval-report -H 'content-type: application/json' \
  -d '{"goal":"# Prompt …"}'

# what the store holds
curl -s localhost:6333/collections
```

A healthy run and a degraded one differ only in the ledger. Reading one:

```
"embedding": { "enabled": true, "model": "text-embedding-3-small", "reason": null },
"store":     { "ready": true, "reason": null, "collection": "quality-memory__v2__…__1536", "chunks": 6 },
"steps": {
  "recall": { "status": "complete", "reason": null,
              "counts": { "probes": 7, "candidates": 6, "kept": 6, "usable": 4, "injected": 4 },
              "runId": "2026-09-08T00-44-11-896-2844fa-quality" },
  "target": { "status": "complete", "counts": { "iterations": 1, "overall": 74.8 }, "runId": "…-2a31d3-quality" },
  "digest": { "status": "complete", "counts": { "memories": 8, "kept": 8 } },
  "store":  { "status": "complete", "counts": { "chunks": 8, "embedded": 16 } }
}
```

Every `runId` there opens in the web client at `?run=<id>`, with the goal the
child actually read — including the injected advisory section — in its request
and its dump's `01-goal.md`. On a recall child, that goal also carries the
`## Retrieved under` list and a `Retrieved under p…` line per candidate, so a
reader can see which condition surfaced each chunk. The web client cannot
_start_ a memory run: it calls `/pipelines`, `/prompts` and `/runs` only, and
memory has no control there yet (§11).

---

## 8. The recent runs

Eight memory runs over two days, against a live subscription model and real
OpenAI embeddings. The first four are the v1 design — a single vector of the
whole lesson, the whole prompt as the query, and an `accept` required before
anything was drawn on. The rest are what §6 describes.

| #   | Prompt              | Recall                           | Target        | Digest                     | Store     |
| --- | ------------------- | -------------------------------- | ------------- | -------------------------- | --------- |
| 1   | order-history       | skipped `provided-run`           | 77.3 provided | accept 92, 6 of 8 kept     | 6 chunks  |
| 2   | notification-fanout | skipped `provided-run`           | 75.5 provided | escalate → `not-accepted`  | skipped   |
| 3   | order-history       | revise 83.4 → `not-accepted`     | escalate 72.7 | escalate → `not-accepted`  | skipped   |
| 4   | order-history       | accept 82.2, 5 of 6 injected     | revise 74.8   | revise 94 → `not-accepted` | skipped   |
| 5   | order-history       | accept, 4 injected, 7 probes     | revise 74.8   | —                          | —         |
| 6   | **parcel-tracking** | **accept 82.2, 5 of 6 injected** | revise 81.3   | **revise 94.5, 7 of 8**    | **7 new** |
| 7   | notification-fanout | revise 70.7 → `not-accepted`     | revise 73.5   | revise, 7 of 8             | **7 new** |
| 8   | rag-quality-memory  | **accept, 6 of 13 injected**     | revise 67.4   | revise, 7 of 8             | **7 new** |

**Cross-prompt transfer, run 6.** The store held six lessons, every one of them
written by an order-history run. The prompt was parcel-tracking: carrier scan
events, signed tracking links, an exceptions view. Nothing in common but the
shape of the obligations. Recall derived six conditions from it — "duplicate
and out-of-order events arrive from an upstream that also replays after an
outage", "a signed link is the only credential a reader presents and it must
scope access to exactly one record" — and the curator kept **all six**
candidates, mapping each to a parcel-tracking criterion and attaching a caveat
naming how the source differed: _here carriers sit on the ingest path_, _the
shopper's emailed link has no session_. Five reached the target's goal. It also
named five gaps the store honestly could not serve, among them dedup keys and
the whole-file CSV export.

That is the mechanism working as designed. What transfers is the `appliesWhen`
condition; what keeps the transfer honest is the caveat.

**Discrimination, run 7.** The same store against notification-fanout was
**refused** — every gate passed, but coverage came back 45 and the score 70.7,
under the bar. The pack listed six gaps: exactly-once per channel, quiet hours
across time zones, a priority class that bypasses the hold, per-tenant provider
rate limits, template editing without a deploy, and read-state converging across
devices. The store knows none of them.

Retrieval was not the failure, and the probes prove it independently. One probe
— _a read path must stay available at a stated percentage while the downstream
write path is degraded_ — matched the vendor-hop lesson at **0.6062**, the
store's one genuinely applicable item, found strongly. Every other probe topped
out between 0.32 and 0.41. The retriever's scores and the curator's coverage
agree without consulting each other: roughly one need of six is served. Memory
transferred where it applied and was declined where it did not, which is worth
more than transfer everywhere would have been.

**Memory flows in even when it does not flow out.** Run 7's recall was refused,
so its target ran bare — and its digest still contributed seven lessons about
exactly the material the store had been missing. The two directions are
independent by construction, which is what lets a store fill in the gaps its own
recalls just reported. Run 8 is the first to draw on a multi-domain store: it
saw **thirteen** candidates rather than six, kept eight and injected six.

**What `admits()` was worth, exactly.** Run 6's digest scored **94.5** and still
ended `revise` on `max-iterations`, because one confirmed
`misattributed_evidence` named `memory.7`. Under the old rule that is run 4
again — a digest in the nineties discarded whole, nothing stored. Under
`admits()` the run cleared its three gates and its bar, `memory.7` was excluded
on its own, and the other **seven were stored**. The difference between the two
rules, on this run, is seven lessons against none.

The seven are the kind the store exists for. None names a parcel or a carrier:
_give every monitored set a terminal state_; _count every hop a read actually
traverses in the availability product_; _keep the field a staleness predicate
measures semantically distinct from arrival time_; _nail down whether a periodic
bulk export is per-period or cumulative_. `run_specific` is armed and did not
need to fire — the digest produced no reuse finding at all.

**What the comparison still does not show.** Run 6 scored 81.3, the highest
`system-design` result recorded here, against a prior range of 70 to 77.3. It is
a different prompt from every other run, so it is not a controlled comparison
and is not offered as one. The only controlled pair remains runs 4 and 5 against
a bare order-history run: 74.8 against 77.3, the answer changing shape rather
than improving. Whether memory makes answers better is still unmeasured.

**Why nothing was stored after runs 2, 3 and 4.** Three different reasons, none
of them the composition's. Run 2's digest got a malformed reply on its criteria
call and escalated honestly with zero criteria. Run 3's could not reach the
model at all — an agent workflow had exhausted the subscription quota, so both
its calls came back `error`. Run 4's is the case above, and is why the rule
changed.

---

## 9. The questions this page exists to answer

**Is a memory run a pipeline?** No, and that is the point. It is an
orchestration over three of them, with its own row, its own endpoint and its
own vocabulary, and it reaches the engine only through `RunsService.execute` —
the same method the CLI uses. A fourth pipeline would have meant a
`PipelineDefinition` whose producer is not an LLM, which the engine does not
allow and which would have meant changing it.

**Why does memory reach the producer through the goal?** Because there is no
other channel. `LensContext` and `ProducerInput` are closed; `materialize`
always builds an LLM producer; no stage takes a parameter a pipeline can
supply. Appending to the goal is the only seam that does not require opening
the engine, and the engine staying closed was the requirement.

**What stops the loop digesting its own memory?** `bareGoal` strips from the
advisory heading, and the digest composes its record from the stripped prompt,
not the goal the target read. Without it, every run would re-digest the
lessons it was handed and the store would fill with echoes. Search also
dedupes on `contentHash`, so one lesson learned twice is one candidate.

**What must the loop clear before its own output may be drawn on?** Three
gates and its own score bar — `artifactPresent`, `validatorsPassed`,
`evidenceSufficient`, and `overall >= acceptAt`. Not `policyAllowed`, and not
an `accept`. This used to be the whole decision, on the reasoning that
half-endorsed memory is worse than none because it enters a producer's context
unmarked. That reasoning was right about the _item_ and wrong about the _run_:
`policyAllowed` goes false the moment any blocker is open anywhere, so one
finding against a summary that is never stored withheld eight memories nothing
had faulted. The item-level rule is unchanged and is what carries the
guarantee — a chunk or memory a confirmed finding names is still excluded,
one by one.

**Why not just give the memory pipelines more iterations?** Because that
treats a budget as the problem when the veto was. A blocker that needs a third
pass may not close on the third pass either, and every extra iteration is real
model spend on both memory pipelines of every memory run. Per-item admission
costs nothing and fixes the case that actually occurred.

**Does memory actually cross prompts?** Yes, and this is now measured rather
than hoped. A parcel-tracking run — carrier scans, signed links, an exceptions
view, nothing to do with order history — recalled all six lessons a
_order-history_ run had written, and the curator kept every one, mapping each
to a parcel-tracking criterion and attaching a caveat naming how the source
context differed: "here carriers sit on the ingest path", "the shopper's
emailed link has no session". It also named five gaps the store genuinely
could not serve. That is the mechanism working exactly as designed: the
`appliesWhen` condition is what transfers, and the caveat is what keeps the
transfer honest.

**What did the live runs prove?** That the composition works end to end on
real models and a real store, that criteria derivation was not contaminated by
injected memory, that the store round-trips, and now that a lesson survives the
journey to an unrelated problem. **What they still do not prove** is that
memory makes answers better. That comparison remains one run each on one
prompt, with the score slightly down (§8).

**Where is the loop still calibrated by hand?** The two memory pipelines'
thresholds and gates are starting values, chosen once and adjusted three times
since (§10). What has changed is that a corpus now exists and has been measured
against: the named-vector and probe designs in §6 were both chosen from cosines
read off the live store, and `retrieval-report` exists to sweep it. What has
_not_ moved because of any of that is a single threshold — no `acceptAt`, no
severity weight, and deliberately no score floor.

---

## 10. What was built, in order

Four bodies of work, each self-contained.

- **`e3e051d` — the two pipelines as plugins.** 38 files: `memory-recall` and
  `experience-digest` as folders beside `system-design`, with the codec,
  validator and alias conventions §3 describes; criteria `[QL-14]` and
  `[QL-15]`; a registry spec. The engine untouched. Both were exercised alone
  through `POST /runs` before anything composed them — the recall pipeline on
  chunks lifted by hand from persisted runs, the digest on a three-iteration
  run.
- **`f3a7a7b` — the composition.** 49 files: the memory module, the four
  routes, the `memory_run` and `memory_embedding` tables, the
  `EmbeddingClient` port and its OpenAI adapter, Qdrant in compose, the stack
  script and CI, and criteria `[QL-16]` through `[QL-18]`. The additive edits
  to existing code are four of the five listed in fact 1.
- **`9372487` — what an adversarial review changed.** Four review dimensions
  produced 42 findings; the ones that survived verification became: the serial
  ledger with a logged flush instead of an unhandled rejection that would have
  killed the process; `closeSteps` shared by the error path and the boot
  sweep, with the sixteenth reason `errored`, so no step can end open; the
  bare goal taken once so the record, the query and the target agree; the
  digest stripping before composing rather than after; a non-uuid id answering
  404; bounded timeouts on both network clients; and Qdrant on loopback with
  telemetry off.

- **Symmetric retrieval and honest admission.** 28 files, and the only one of
  the four driven by a measurement rather than a review: reading the live
  vectors showed the documents sat closer to each other than to the query
  (§6). It brought the `v2` generation and named vectors, `QueryProbes` with
  its own persona, reciprocal-rank fusion, `admits()` replacing the accept
  veto, `run_specific` gated, `reindex` and `retrieval-report`, and the fix
  that stopped a throwing embedding cache from cancelling the target run. It
  added **no criterion id** — `[QL-18]` is still the highest in the repo — so
  the probe, fusion and named-vector specs are uncriterioned, which §11 notes.

Three calibration changes have come from live runs rather than from review.
The first recall blocked an 83-point pack on a single medium
`unsupported_insight`; that type is now priced rather than gated
(`memory-recall/definition.ts:110-113`), because a producer reading the pack
sees each chunk's own text beside the insight. A digest at 94 was then thrown
away whole over a finding against its summary, which produced `admits()`. And
`run_specific` was gated once the arithmetic showed pricing could never stop a
run-specific memory reaching the store (§1).

---

## 11. Discrepancies, and what is not built

Notes, not fixes. None affects behaviour.

- `qdrant/collection.ts` declares `INDEXED_FIELDS` and creates a keyword index
  for each, but `searchMany` passes no filter — only `query`, `using`, `limit`
  and `with_payload`. The indexes are prepared for a filtered search that does
  not exist yet.
- Every payload carries `storedAt` and `keys`; `fromPayload` destructures both
  and discards them. Nothing reads either back.
- `MemoryStepDto.counts` is an open `Record<string, number>`. The keys
  (`probes`, `candidates`, `kept`, `usable`, `injected`, `iterations`,
  `overall`, `memories`, `chunks`, `embedded`) are a convention in `steps.ts`,
  not a closed vocabulary the way the reasons are.
- Neither `reindex` nor `retrieval-report` has a spec. Both were exercised
  live — `reindex` performed the v1 to v2 migration and `retrieval-report`
  produced the numbers in §6 — but nothing in the suite covers them.
- `fixtures/stored-memories.json` is referenced by no code. It is the store
  captured before the generation bump, kept because a migration that cannot be
  checked against the thing it migrated is not a migration.
- `RetrievalProbeDto.found[].using` is typed `string` rather than a union,
  because `contracts` cannot import the module's `VECTOR_NAMES`. It is the one
  place the named-vector vocabulary is not type-linked; `collection.ts` keeps
  the link with a `satisfies` clause instead.
- `steps.ts` passes the whole goal to `probeTexts` while deriving the probes
  from the capped head. Harmless — `probeTexts` re-caps internally — but the
  asymmetry reads as an oversight and is not one.
- **Write-time deduplication was measured and deliberately not built.** The
  store dedupes only on exact `contentHash`, so two runs that learn the same
  lesson in different words both persist. Whether that is worth a rule is an
  empirical question, and at 27 lessons from four runs the answer is no. The
  closest pair of condition vectors anywhere scores 0.6949 — "claiming a p95
  target for a multi-hop path that includes batching and hedging" against "a
  latency budget must meet a p99 target across a hop you do not control" —
  which is a related family, not a restatement. Nothing reaches 0.85, and the
  top of the distribution is a smooth continuum (0.695, 0.674, 0.581, 0.565,
  …) whose largest gap is 0.094. Real duplicates would show a cluster near 1.0
  separated by a wide gap. Any threshold low enough to fire here would delete
  lessons that genuinely differ. Worth re-measuring as the store grows; the
  script is trivial and the shape of the distribution is the thing to watch,
  not any one number. **Re-measured twice since, and the answer held both
  times.** At 92 lessons the top pair was 0.7527 with nothing above 0.80; at
  145 lessons, 10,440 pairs, the top twelve ran 0.753, 0.697, 0.695, 0.690,
  0.685 … — still a continuum, largest gap in the top twenty 0.0555, still
  nothing at 0.80. Three measurements across a five-fold growth in the store,
  and the distribution has not developed the cluster a suppression rule would
  need.
- Nothing prunes either store. `replaceRunChunks` deletes only by run id, and
  the embedding cache has no expiry.
- The boot sweep runs in every process that boots `AppModule`, including the
  CLI. Running `pnpm quality-loop:run` while the server has a memory run in
  flight will fail that run as `interrupted`. Quality runs have carried the
  same property since `d0c92e3`.
- `overview.md`'s two organising counts — five pipelines, nine model call
  sites — predate the quality loop entirely and now understate both further,
  since probe derivation is a tenth call site. Correcting them means rewriting
  that page's premise, which is a separate change.

The doctrine's last stage — "system stores trace + lessons", which
[`../pipeline-best-practices/gap-analysis.md`](../pipeline-best-practices/gap-analysis.md)
§2.7 records as a missing memory tier — is what this work built. The incident
loop that section also asks for, where a production failure becomes a
regression fixture, is not.

Not built yet, by choice: filtered or per-project search, pruning and expiry,
storing findings and sections as chunks rather than only lessons (the kinds
are already in the vocabulary), a web-client control for memory runs, a Tilt
manifest for the vector store, a score floor on retrieval, and any movement of
the two memory pipelines' thresholds against a corpus. The corpus itself is no
longer missing — §6 is what reading it produced — but nothing has been tuned
because of it, and a floor set on six chunks would be a number invented to look
like a measurement.

---

## 12. What the first `agentic-design` run exposed

One live run against `workflow-graph-engine` was meant to confirm the new
vocabulary. It confirmed that and found two defects the earlier nine hours of
`system-design` runs had hidden.

**The vocabulary works.** The deriver returned 20 criteria — 9 `capability`,
6 `property`, 3 `contract`, 2 `constraint`, and no `scale`. The same brief
under `system-design` had produced `scale` criteria from a table of three
workflow rows. That is the whole point of the second pipeline, and it holds.

**The run still scored 0, because declared limits were fiction.** The producer
came back `schema-miss`, so `artifactPresent` was false, no critic or evaluator
ran, and the controller escalated with every dimension at zero. There is no
retry: `llm-producer.ts` returns `llm-failed` and the iteration is over. Two
separate limits were wrong.

`maxTokens`, measured over every exchange in `static/runs/`:

| scope                 | declared | calls | max observed | over the cap |
| --------------------- | -------- | ----- | ------------ | ------------ |
| `producer`            | 5000     | 43    | 15,746       | **100%**     |
| `critic.soundness`    | 2500     | 38    | 11,244       | **100%**     |
| `critic.requirements` | 2500     | 38    | 7,773        | **100%**     |
| `critic.provenance`   | 2000     | 63    | 11,136       | 98%          |
| `evaluator.coverage`  | 2000     | 47    | 4,433        | 77%          |

Nearly every lens in every pipeline overran the number beside it, and had done
all along. It was invisible because the subscription client passes `maxTokens`
to the Agent SDK, which does not enforce it — but `anthropic-client.ts` sets it
as a hard `max_tokens`. The system would have appeared to work until the first
run with an API key, at which point most lenses would truncate mid-JSON and
fail their schema. Every cap now sits above its measured maximum: producer
16000, critics 12000, evaluators 8000, `deriveCriteria` 4000, in all four
pipelines.

The `agentic-design` output schema was the second. The one real answer pressed
against **five** caps simultaneously — contracts 12/12, policies 8/8, memory
6/6, extensibility 6/6, roles 10/10 — and broke two: `summary` at 869 against a
600 limit, `flows` at 7 against a max of 6. The schema was one size too small
for a brief carrying nine requirements, and it was too small because it was
copied from `system-design`, whose artifact has eight sections where this one
has ten. Sizing is now taken from that answer rather than guessed again.

The general lesson is worth stating once: **a declared limit is a contract with
the model, not a comment.** `maxTokens` too low truncates; a schema bound too
tight discards the artifact whole. Neither failure names itself — one surfaces
as `schema-miss`, the other as a run that escalates with no artifact — so
neither is discoverable without measuring against real runs. `CLAUDE.md` now
carries this as a rule.

### 12.1 The prompts were still shaped for the other pipeline

The fifteen briefs in `prompts/agentic/` had been written to the `system-design`
template: `## Functional requirements`, `## Non-functional requirements`,
`## Scale targets`. That template feeds `system-design`'s kinds, `scale`
included. Under `agentic-design` a whole section was seeding a kind that does
not exist, while `contract` and `property` — the two kinds this pipeline is
built around — had no section to come from.

The sections now map one to one onto the kinds:

| section                        | kind         |
| ------------------------------ | ------------ |
| `## Capabilities`              | `capability` |
| `## Interfaces that must hold` | `contract`   |
| `## Properties`                | `property`   |
| `## Constraints`               | `constraint` |

`## Interfaces that must hold` is the new one and the delicate one. It states
the seams — what one part hands another and what the receiver may assume,
including on failure — while naming no components, so the brief fixes the
obligation without doing the design for the candidate. `## Scale targets` is
gone.

Five briefs were added, taking the corpus to fifteen: `tool-contract-broker`,
`provenance-ledger`, `intake-normaliser`, `consensus-panel` and
`workflow-composer`. Measured rather than asserted, the fifteen have mean
pairwise cosine **0.6253** and max **0.7588**, against **0.5605** and **0.6388**
for the existing ten system-design briefs. The agentic corpus is the tighter of
the two, partly by construction — one domain, and now one section template.
Nothing reaches 0.80; cross-corpus similarity is 0.5041. The held-out control is
`intake-normaliser`, chosen on nearest-neighbour rather than mean similarity
(0.6260, the loosest in the corpus), because a control is only clean if no close
sibling can contribute lessons on its behalf.

### 12.2 One number to watch

The same verification run recalled 16 candidates, kept 8, and injected
**nothing**. The store held 166 lessons at the time, every one of them written
by a `system-design` run. That is the 0.4986 cross-domain baseline from §1.1
showing up operationally rather than as a measurement: the curator looked at a
store built by one judge, on behalf of a brief from another domain, and
correctly concluded that none of it earned a place in the prompt. Whether that
stays true as agentic runs contribute their own lessons is the question the next
experiment exists to answer.
