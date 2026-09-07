# Memory runs: three pipelines behind one endpoint, and what the recent runs showed

How the quality loop learned to read its own past. The step semantics, the
closed reason vocabulary, the dump layout and the guarantees are owned by
[`../pipeline-best-practices/quality-loop.md`](../pipeline-best-practices/quality-loop.md);
this page sits one level above it and adds what that file does not carry — why
the composition has the shape it has, how to operate it, and what four live
runs actually showed. For the five pipelines the rest of the app runs, see
[`./overview.md`](./overview.md) beside this file.

Two facts organise everything below:

1. **Nothing in the engine or the three pipelines changed.** The composition
   is a module beside them (`src/modules/memory/`). The only edits to existing
   code were exporting `RunsService`, one optional callback on
   `RunsService.execute`, a module import, and `enableShutdownHooks()`. That
   is why there are three pipelines and a fourth _endpoint_, not a fourth
   pipeline.
2. **The producer only ever sees the goal.** `core/stages/llm-producer.ts`
   assembles `# Goal` and `# Success criteria` and nothing else. Every design
   decision below follows from that one fact: the input codecs, the advisory
   section appended to the goal, the byte budget, and aliases used as engine
   location ids.

---

## 1. The three, at a glance

All three are instances of one `PipelineDefinition`, declared as data under
`packages/quality-loop/src/pipelines/`, registered by one line each in
`index.ts`. Any of them can be a memory run's target; two of them also play a
role inside one.

| Pipeline            | Role in a memory run              | What it judges                                                         | Gates acceptance                          | Loop         |
| ------------------- | --------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------- | ------------ |
| `system-design`     | the target (the requested one)    | a design answer against criteria derived from the prompt               | `constraint` kind, `constraint_violation` | 3 iterations |
| `memory-recall`     | step 1 — curates recalled chunks  | which chunks serve the query, and whether each insight is in its chunk | `admissibility` kind, `no_usable_memory`  | 2 iterations |
| `experience-digest` | step 3 — distils the finished run | which evidence the record shows moved quality, stated to transfer      | `misattributed_evidence`                  | 2 iterations |

The two memory pipelines share a policy shape: `minHits: 2` on every lens, so
a gated finding needs both samples of a critic to agree before it blocks;
`acceptAt: 75`; `rejectBelow: 30`. `memory-recall/definition.ts:102` and
`experience-digest/definition.ts:106` say why.

`system-design` is only the default target. `POST /memory-runs` takes a
`pipeline` like `POST /runs` does, and the module refuses only the two memory
roles as targets.

---

## 2. The shape of a memory run

```
POST /memory-runs ──► MemoryService.open ──► memory_run row ──► 202 { memoryRunId }
{pipeline, goal,             │                                    (poll GET /memory-runs/:id)
 output?, maxIterations?}    │
                             │  1 recall   goal head ──► memory_embedding (cache) ──► Qdrant search
                             │                │                                            │
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
                             │  4 store    accepted memories, unfaulted ◄──┘
                             │                └──► Qdrant upsert, one lesson chunk per memory
                             │
                             └──► each step's status, reason, counts and child run id ──► memory_run.steps
```

Each of the three children is an **ordinary quality run**: its own
`quality_run` row, its own dump under `static/runs/` with kind `quality`, and
its own page at `GET /runs/:id` in the web client. The memory run adds only
what exists nowhere else — the step ledger, the availability it saw, and the
linkage.

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

`packages/quality-loop/src/modules/memory/`. Four routes, hand-built
envelopes, inline `ZodValidationPipe`, the same conventions as
`runs.controller.ts`.

| Verb   | Path                  | Code | Body / query                  | Answers                                 |
| ------ | --------------------- | ---- | ----------------------------- | --------------------------------------- |
| `POST` | `/memory-runs`        | 202  | the shared `runRequestSchema` | `{ data: { memoryRunId, status } }`     |
| `POST` | `/memory-runs/digest` | 202  | `{ runId }`                   | the same                                |
| `GET`  | `/memory-runs`        | 200  | the shared list query         | `{ data, meta }`, newest first          |
| `GET`  | `/memory-runs/:id`    | 200  | —                             | `{ data: MemoryRunDto }`, 404 otherwise |

The body of a memory run is **exactly** the body of a quality run. `output`
and `maxIterations` reach the target only; recall and digest run on their own
policy loop, which the DTO comment states.

Guards, before any row exists (`memory.service.ts:100-115`): a pipeline not in
`RunsService.list()` is a 404, the same as `POST /runs`; either memory role as
the target is a 400; an unknown source run for a digest is a 404; an id that
is not a uuid answers 404 rather than raising a database error.

**The record.** `memory_run` (uuid primary key) holds the target pipeline, the
status, the bare request summary, the embedding and store availability the run
saw at open, the step ledger as jsonb, and three nullable references to
`quality_run` with `on delete set null`. `memory_embedding` beside it is the
cache. Both come from one migration.

**The ledger.** `StepLedger` (`steps.ts:73`) mutates the record in memory and
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
| `store-empty`          | recall — the collection holds nothing, or the search matched nothing             | seed with `POST /memory-runs/digest` over past runs                 |
| `embedding-failed`     | recall, store — the provider returned nothing after one retry                    | check the `llm: embeddings request failed` line for status and body |
| `pipeline-unavailable` | recall, digest — the role's id is not registered                                 | the registry lost an entry, or a spec overrode it                   |
| `run-failed`           | any step whose child run ended `failed`                                          | read the child at `GET /runs/:id`; `note` carries its message       |
| `not-accepted`         | recall, digest — the child ran but did not accept                                | nothing to fix; the loop declined to endorse, which is the design   |
| `no-usable-memory`     | recall — accepted, but a confirmed finding names every kept chunk                | the pack faulted itself; better memory has to be stored first       |
| `goal-at-budget`       | recall — the goal alone already fills the 64,000-byte budget                     | shorten the prompt if memory matters more than its tail             |
| `provided-run`         | recall, target of a digest-only run                                              | expected; the target already happened                               |
| `target-failed`        | digest, store — the target run failed                                            | fix the target, then `POST /memory-runs/digest` for the other half  |
| `nothing-to-digest`    | digest, store — the source run has no trace                                      | it never produced one; nothing to learn                             |
| `digest-failed`        | store — the digest run failed                                                    | as `run-failed`                                                     |
| `no-memories`          | digest, store — accepted, but a finding names every memory                       | the digest faulted its own proposals                                |
| `interrupted`          | any step, at boot — the process died mid-run                                     | re-run; completed children are still persisted                      |
| `errored`              | any step — an unexpected throw closed the run                                    | `note` carries the message; this one is a bug                       |

Two shapes are worth naming. **`skipped` is not failure** — the whole memory
half is optional, and a run whose four steps read `embeddings-disabled` still
produced its answer. And **anything short of `accept` endorses nothing**: a
`revise` pack injects no memory, a `revise` digest stores none.

---

## 6. The vector store and the embeddings port

Qdrant, as a `docker-compose` service named `vectors`, started, waited for and
stopped alongside Postgres by `scripts/stack.sh`. It is bound to `127.0.0.1`
with telemetry off and keeps its data in the named volume `sysdesign-qdrant`.
The image ships no shell, so readiness is gated from the host on `/readyz`
rather than by a compose healthcheck.

The adapter is `qdrant/qdrant-memory-store.ts` behind the `MemoryStore` port,
so the module never imports the client directly:

- **One collection per model and width**,
  `quality-memory__<model>__<dimensions>`, cosine distance, created on first
  use. A model change therefore cannot mix vectors of different meanings — it
  starts a new collection and leaves the old rows unreachable until they are
  re-digested.
- **A deterministic point id**, `sha256(sourceRunId|ref)` reshaped as a uuid,
  so the same memory always lands on the same point and re-digesting a run
  replaces its chunks rather than duplicating them. `replaceRunChunks` deletes
  by `runId` and upserts, both with `wait: true`, so a memory just stored is
  searchable by the next run.
- **Dedupe on read.** Search over-fetches three times the limit and keeps the
  best-scoring chunk per `contentHash`, so the same lesson learned from
  repeated runs of one prompt is one candidate, not several.
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
reports how many texts actually reached the provider.

---

## 7. Operating it

```bash
# the stack: Postgres on 5433 and Qdrant on 6333, started and stopped together
pnpm stack:db
pnpm db:migrate
pnpm stack:down                                  # both, data stays in the named volumes

# the service; Node loads .env, which is where OPENAI_API_KEY lives
pnpm quality-loop:serve                          # or pnpm quality:start for :3003 + :4201

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

# what the store holds
curl -s localhost:6333/collections
```

A healthy run and a degraded one differ only in the ledger. Reading one:

```
"embedding": { "enabled": true, "model": "text-embedding-3-small", "reason": null },
"store":     { "ready": true, "reason": null, "collection": "quality-memory__…__1536", "chunks": 6 },
"steps": {
  "recall": { "status": "complete", "reason": null,
              "counts": { "candidates": 6, "kept": 6, "usable": 5, "injected": 5 },
              "runId": "2026-09-07T20-09-05-115-bc5085-quality" },
  "target": { "status": "complete", "counts": { "iterations": 1, "overall": 74.8 }, "runId": "…-2a31d3-quality" },
  "digest": { "status": "complete", "reason": "not-accepted", "counts": { "memories": 8, "kept": 0 } },
  "store":  { "status": "skipped",  "reason": "not-accepted" }
}
```

Every `runId` there opens in the web client at `?run=<id>`, with the goal the
child actually read — including the injected advisory section — in its request
and its dump's `01-goal.md`.

---

## 8. The recent runs

Four memory runs over one day, against a live subscription model and real
OpenAI embeddings. The first two seeded memory from runs that already existed;
the last two composed the whole chain.

| #   | Recall                           | Target                        | Digest                     | Store    |
| --- | -------------------------------- | ----------------------------- | -------------------------- | -------- |
| 1   | skipped `provided-run`           | skipped `provided-run` (77.3) | accept 92, 6 of 8 kept     | 6 chunks |
| 2   | skipped `provided-run`           | skipped `provided-run` (75.5) | escalate → `not-accepted`  | skipped  |
| 3   | revise 83.4 → `not-accepted`     | escalate 72.7                 | escalate → `not-accepted`  | skipped  |
| 4   | **accept 82.2, 5 of 6 injected** | revise 74.8                   | revise 94 → `not-accepted` | skipped  |

Thirteen quality runs sit underneath them — three `system-design` from before
this work, and ten the memory runs created:

| Pipeline            | Runs | Decisions                                        |
| ------------------- | ---- | ------------------------------------------------ |
| `system-design`     | 5    | revise ×4, escalate ×1 (70 – 77.3)               |
| `memory-recall`     | 3    | accept ×2 (80.6, 82.2), revise ×1 (83.4)         |
| `experience-digest` | 5    | accept ×2 (92, 100), revise ×1 (94), escalate ×2 |

**What run 4 showed.** The prompt was the order-history design; the memory
came from an earlier bare run of that same prompt. Recall accepted its pack at
82.2 and five of six chunks reached the target's goal — 6,406 bytes of
advisory evidence appended to a 2,326-byte prompt. **All eighteen criteria the
target derived trace to the prompt; none came from the advisory section.**
That was the main risk of reaching a producer through the goal, and the
heading plus its lead sentence held it.

**What the comparison did not show.** Against the bare run of the same prompt:
contradictions fell from six to two and completeness rose from 88 to 100,
while quality attributes fell from 78.4 to 56 and the overall from 77.3 to
74.8. The answer changed shape rather than improving. That is one run each and
proves nothing statistically; it is recorded because it is what happened.

**Why nothing was stored after runs 2, 3 and 4.** Three different reasons,
none of them the composition's. Run 2's digest got a malformed reply on its
criteria call and escalated honestly with zero criteria. Run 3's could not
reach the model at all — an agent workflow had exhausted the subscription
quota, so both its calls came back `error`. Run 4's reached 94 but never
cleared its gated `misattributed_evidence` finding inside two iterations. Only
an accepted digest becomes memory, so the store stayed at the six lessons run
1 wrote. The gate working is not the same as the gate being well calibrated —
see §11.

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

**Why is a `revise` from the memory pipelines treated as nothing?** Because
the controller's decision is the system's verdict about its own output, and
half-endorsed memory is worse than none: it would enter a producer's context
unmarked. The same rule runs in both directions — a `revise` pack injects
nothing, a `revise` digest stores nothing.

**What did the live runs prove?** That the composition works end to end on
real models and a real store, that criteria derivation was not contaminated by
injected memory, and that the store round-trips: a lesson written by one run
was recalled, curated and read by another. **What they did not prove** is that
memory makes answers better. One run each, one prompt, and the score went
slightly down.

**Where is the loop still calibrated by hand?** The two memory pipelines'
thresholds and gates are starting values, chosen once and adjusted once (§10).
Nothing has tuned them against a corpus, because there is not one yet.

---

## 10. What was built, in order

Three commits, each self-contained.

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
  to existing code are the four listed in fact 1.
- **`9372487` — what an adversarial review changed.** Four review dimensions
  produced 42 findings; the ones that survived verification became: the serial
  ledger with a logged flush instead of an unhandled rejection that would have
  killed the process; `closeSteps` shared by the error path and the boot
  sweep, with the sixteenth reason `errored`, so no step can end open; the
  bare goal taken once so the record, the query and the target agree; the
  digest stripping before composing rather than after; a non-uuid id answering
  404; bounded timeouts on both network clients; and Qdrant on loopback with
  telemetry off.

One calibration change came from the live runs rather than the review: the
first recall blocked an 83-point pack on a single medium
`unsupported_insight`. That type is now priced rather than gated
(`memory-recall/definition.ts:87`), because a producer reading the pack sees
each chunk's own text beside the insight — an over-reaching insight is a
penalty, not a reason to withhold everything.

---

## 11. Discrepancies, and what is not built

Notes, not fixes. None affects behaviour.

- `qdrant/collection.ts` declares `INDEXED_FIELDS` and creates a keyword index
  for each, but `search` passes no filter. The indexes are prepared for a
  filtered search that does not exist yet.
- Every payload carries `storedAt`; `fromPayload` destructures it and discards
  it. Nothing reads it back.
- `MemoryStepDto.counts` is an open `Record<string, number>`. The keys
  (`candidates`, `kept`, `usable`, `injected`, `iterations`, `overall`,
  `memories`, `chunks`, `embedded`) are a convention in `steps.ts`, not a
  closed vocabulary the way the reasons are.
- Nothing prunes either store. `replaceRunChunks` deletes only by run id, and
  the embedding cache has no expiry.
- The boot sweep runs in every process that boots `AppModule`, including the
  CLI. Running `pnpm quality-loop:run` while the server has a memory run in
  flight will fail that run as `interrupted`. Quality runs have carried the
  same property since `d0c92e3`.
- `overview.md`'s two organising counts — five pipelines, nine model call
  sites — predate the quality loop entirely and now understate both.
  Correcting them means rewriting that page's premise, which is a separate
  change.

The doctrine's last stage — "system stores trace + lessons", which
[`../pipeline-best-practices/gap-analysis.md`](../pipeline-best-practices/gap-analysis.md)
§2.7 records as a missing memory tier — is what this work built. The incident
loop that section also asks for, where a production failure becomes a
regression fixture, is not.

Not built yet, by choice: filtered or per-project search, pruning and expiry,
storing findings and sections as chunks rather than only lessons (the kinds
are already in the vocabulary), a web-client control for memory runs, a Tilt
manifest for the vector store, and any calibration of the two memory pipelines
against a corpus.
