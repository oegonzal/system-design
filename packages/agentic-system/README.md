# agentic-system

Designs and coaches **agentic-memory strategies** on the quality loop, learns
from each finished run, and serves a finished strategy as a **memory space**. It
is the "application + durable orchestration + human-approval" layer for the
memory-design capability: it takes a memory brief, runs the loop's
`memory-architecture` coach to generate and grade a strategy from it, and hands
the finished run to the `memory-design` orchestrator to digest and store as
memory. A settled run's strategy then becomes a space the
`@sysdesign/agentic-memory` runtime executes — its registers the stores, its
declared interfaces the only verbs it serves — over Postgres, with a pgvector
projection in that same database for recall by meaning.

Nothing here judges or grades — that is the quality loop's engine — and nothing
here executes a strategy — that is the runtime. This service is the domain: the
component catalog a memory design is drawn from, the driver that moves a design
cycle through the loop, and the mount that wires the runtime to its stores, its
embedder and HTTP. The engine stays generic; every memory-specific thing lives
here as declared data.

## Routes

| Method | Path                                  | What                                                                                                                                                                                           |
| ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/designs`                            | Start a design cycle from a memory brief (`{ goal }`); 202 with the cycle, which runs off the request path.                                                                                    |
| `GET`  | `/designs/:id`                        | Read a cycle back: its status, the coach run, the orchestration that learned from it.                                                                                                          |
| `POST` | `/spaces`                             | Make a memory space from a settled run's best strategy (`{ runId }`); 201 with the space and its compile report.                                                                               |
| `GET`  | `/spaces/:id`                         | Read a space back, its report compiled again from the snapshots it keeps.                                                                                                                      |
| `PUT`  | `/spaces/by-name/:name`               | Ensure the space under a name (`{ runId }`): made from the run when none holds the name, the same space when that run made it; 200 with `{ space, created }`. A name another run holds is 409. |
| `GET`  | `/spaces/by-name/:name`               | Read the space under a name; an unknown name is 404.                                                                                                                                           |
| `POST` | `/spaces/:id/remember`                | Assert a typed memory in a register: inserted, unchanged (it says the same), or superseding the current one.                                                                                   |
| `POST` | `/spaces/:id/update`                  | Supersede an addressed, current record with a new version of the same identity.                                                                                                                |
| `POST` | `/spaces/:id/invalidate`              | Close an addressed, current record with its reason.                                                                                                                                            |
| `POST` | `/spaces/:id/recall`                  | Recall by key (exact), by text (meaning), or by a time range alone; ranked, budgeted, each item with its factors and routes.                                                                   |
| `POST` | `/spaces/:id/consolidate`             | Turn verified episodes in a scope into lessons, and lessons into playbooks, as the strategy routes them.                                                                                       |
| `POST` | `/spaces/:id/history`                 | Every version of an addressed record's identity, oldest first.                                                                                                                                 |
| `POST` | `/spaces/:id/digests`                 | Digest a text — split into parts its owner labels and dates — into the space's typed memories on the quality loop; 202 with the orchestration, which runs for minutes.                         |
| `GET`  | `/spaces/:id/digests/:runId`          | Read a digest back from the loop's record: its step's status, reason and counts, its report — every memory proposed, endorsed or withheld — and the apply, once made.                          |
| `POST` | `/spaces/:id/digests/:runId/remember` | Remember what the digest endorsed, once, through the runtime's own write path; 200 with each memory's outcome or refusal.                                                                      |
| `GET`  | `/health`                             | Liveness.                                                                                                                                                                                      |

The coached strategy is the coach run's artifact; read it from the loop
(`GET /runs/:id`), not from this service. Every request and answer of the
`/spaces` routes is a contract in `@sysdesign/contracts`
(`lib/agentic-system/memory.ts`, and for a digest `register-digest.ts` and
`register-memory.ts`); a verb answers 200 with `{ data }`, a digest's start 202.

## How a cycle runs

1. **Coach** a strategy from the brief: one `memory-architecture` run with
   coach-only recall (`recall: true`, a per-run flag an orchestration cannot
   carry), judged against the memory rubric the loop derives from the goal. The
   pipeline generates the strategy (registers / interfaces / workflows) from the
   brief; no output is supplied.
2. **Learn**: hand the finished run to the `memory-design` orchestrator
   (`from-run`) to digest it into typed memory, faceted by the pipeline's own
   dimensions (retrieval, ingestion, scoping, …).

## Memory spaces

`POST /spaces` reads the run from the loop and its best iteration's strategy
the way the loop kept it, then hands it to the runtime with the declared
policy. The runtime compiles the strategy's typed declarations — never its
prose — and keeps the space with snapshots of the strategy and the policy, so a
space compiles the same on every load and does not change when the run or the
policy file does; the space records which settings its policy came from
(`policySource`, e.g. `memory/standard`). A request names its scope as the
policy's scope keys, the first of them the partition every request carries; a
memory is visible to a request whose scope contains its own. The space answers
the scope keys of the snapshot it keeps, so a caller reads what it may name.

A consumer that wants its space back without keeping an id ensures it under a
name — `PUT /spaces/by-name/:name` with the run — a lower-case word of letters,
digits and hyphens (`spaceNameSchema` in the contracts). The same name from the
same run is the same space; a name another run holds is refused
(`space.name_taken`), as is a claim that lost its race, so no name is kept
twice. A space made by `POST /spaces` has no name.

Every refusal answers one declared status, its body the framework's error shape
plus the refusal's `code`, `message` and `issues`. The statuses are declared
once in `@sysdesign/contracts` (`lib/agentic-system/space-host.ts`, the
runtime's codes and the host's) and answered by `src/memory/refusals.ts`:

| Status | Refusals                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 404    | `run.not_found` (an orchestration another orchestrator ran, or a digest composed for another space, is not found too), `space.not_found`, `record.not_found` (a record outside the caller's scope is not found too)                                               |
| 409    | `run.in_flight` (the run or the digest is still running), `digest.applied` (the digest was remembered already), `space.name_taken` (another run holds the name, or a concurrent claim won it), `record.not_current`, `conflict`                                   |
| 422    | `run.no_strategy`, `digest.no_registers`, `digest.too_large`, `digest.no_report`, `space.not_compiled`, `register.unknown`, `operation.undeclared`, `scope.invalid`, `candidate.invalid`, `metadata.undeclared`, `identity.mismatch`, `consolidation.unavailable` |

A strategy that does not compile is 422 with `{ message, report }`, the report
naming every problem. A body the contract does not accept is the pipe's 400,
each offending path named; a loop that cannot be reached is 503, one too slow
504, one that refuses 502.

A digest is briefed by the runtime before any model is asked, so it is refused
wherever its writes would be; the loop's `register-memory` orchestrator then
digests the text and reports what the space may write, and `remember` writes
only that, once, recording the apply. How it is checked, what a caller owns and
what stays open: `docs/agentic-system/memory-runtime.md` §9–§10.

Postgres (`memory_space`, `memory_record`, and each digest's apply in
`memory_space_digest`) is the truth; the vector index is a rebuildable
projection in a pgvector table of that same database
(`vec_agentic_memory__v2__<model>__<width>`, made with its indexes on first
use — raw SQL through the ORM's entity manager, since MikroORM has no vector
type), its collection bound to the index generation, the embedding model and
width. `memory_record.projected_into` names the collection, not the table.
A sweep runs on the declared schedule across every space: it expires
short-term records, removes the points of closed ones (and forgets the mark of
a closed record whose collection is no longer current, asking nothing of the
index), and projects every current record not yet in the current collection —
a write whose projection failed, or every record after the model changed. Without an embedding key the
service still serves its spaces: recall by meaning is skipped and says so
(`embedder_disabled`), while exact and temporal recall still run.

## The layer catalog

`src/catalog/` maps each memory-stack component — PostgreSQL, pgvector, Qdrant,
Temporal, LangGraph, Mem0, Zep, Redis, S3/R2, MCP, Playwright, Langfuse,
OpenTelemetry, BullMQ, a custom memory service, a knowledge graph — to the layer
it fills, the API/interface a design talks to it through, what it contributes,
the operations an edge to it carries, and — for a store — the memory types
(working / episodic / semantic / procedural / relational) it serves. Declared
data, so a design states on its components and edges how each one works; the
catalog names vendors because that is its content, while the engine's lenses
name none.

## Configuration

`config/engine.json` names one file per kind under `config/<kind>/`:

- `config/design/standard.json`: the pipeline, the orchestrator, the coach
  iterations, whether to recall, the poll pace.
- `config/memory/standard.json`: the policy every new space snapshots — the
  scope keys (`tenant`, `project`, `user`, `unit`; the first is the partition
  every request names, the rest a request names as it needs), each term's time
  to live
  (short-term memory must expire), the recall weights, budget and recency
  half-life, the support a lesson and a playbook need — and, beside it, the
  sweep's schedule (`sweep.everyMs`), which belongs to the process and is
  never part of a snapshot. Editing the policy changes new spaces only. The
  numbers are unmeasured starting values.

Environment, read only in `src/config.ts`: `AGENTIC_SYSTEM_PORT` (3007),
`QUALITY_LOOP_URL`, `NOTIFICATIONS_URL`. The vector index needs no variable of
its own: it is a table in the database the db package's `DB_*` variables name
(`QDRANT_URL` went with the move to pgvector on 2026-11-12). The embedder is
built there too, by the llm package's own factory from its own variables,
`OPENAI_API_KEY` and `OPENAI_EMBEDDING_MODEL`; without a key it is disabled and
the boot log says why. The pod gets those two from the
`agentic-system-embeddings` Secret the Tiltfile builds from the shell or
`.env`, and the database's host from the `local-stores` ConfigMap.

## Notifications

Every transition is announced on the notifications bus twice: a machine record
on its `design.*` topic (`design.started/revised/stored`, source
`agentic-system`), and — for a person watching — an `interaction.prompted` a
channel can deliver. Both are fire-and-forget; a bus that is down never fails a
cycle. Reaching a person needs a channel that carries `agentic-system`: the
dedicated Telegram instance `telegram.agentic-system`
(`AGENTICSYSTEM_TELEGRAM_API_KEY`, `AGENTICSYSTEM_TELEGRAM_BOT_ID`). Without one
the prompt is still recorded on the bus, just not pushed.

Run: `pnpm agentic-system:serve` (needs the quality loop on `QUALITY_LOOP_URL`
and Postgres migrated with `pnpm db:migrate`, which installs the `vector`
extension the index's table is declared with; recall by meaning needs an
embedding key besides). The boot line names the collection the index is bound
to — `vectors: agentic-memory__v2__text-embedding-3-small__1536` — or `none`
without a model. The table is made on the first write or search, not at boot.
pgvector's HNSW index takes a `vector` column of at most 2,000 dimensions
(checked on pgvector 0.8.0, 2026-11-11), so a wider embedding model, such as
the 3,072-wide `text-embedding-3-large`, would fail the table's setup and the
index would refuse every write until a narrower width is chosen.
