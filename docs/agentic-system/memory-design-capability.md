# The agentic-memory design-and-coach capability

_How the capability works, end to end: describe the agentic-memory system you
want, have the quality loop generate and coach a **memory strategy** — the
memory registers it keeps, the typed service interfaces over them, and the
recall / write / consolidation / expiry workflows — judged against the
memory-design literature, and keep the lessons._

It is the same critic → evaluator → controller → store loop the rest of the
project runs, pointed at a subject it used to get wrong. An earlier build drew
agentic memory as a **distributed-systems canvas** (gateway, database, vector-db
boxes); that framed the easy part (the infrastructure) and skipped the hard part
(the _strategy_). This build produces a strategy expressed as **service
interfaces and workflows** — the thing you actually implement memory
orchestrators from — not an infrastructure diagram. The engine stays generic
(CLAUDE.md TOP RULE 2); everything memory-specific is declared data.

---

## 1. What it is

You give it a **memory brief** (the system to design, its recall/freshness/scale
targets, its scoping and governance rules). It derives a rubric, **generates** a
memory strategy, and **coaches** it across iterations. The strategy is a
structured artifact, not a drawing, so it is usable directly: the interfaces are
method contracts, the workflows are step sequences you can implement.

It keeps the memory **types** apart — the reframe's core idea — because they are
written, recalled and retained differently:

| Register kind  | Holds                                                             | Term       |
| -------------- | ----------------------------------------------------------------- | ---------- |
| **working**    | the task in flight — scratch state, recent tool results           | short-term |
| **episodic**   | past events: action taken, outcome observed, distilled to lessons | long-term  |
| **semantic**   | durable learned facts — preferences, decisions, verified facts    | long-term  |
| **procedural** | versioned playbooks and tool recipes                              | long-term  |
| **relational** | entities and how they connect, over time                          | long-term  |

---

## 2. The architecture at a glance

```
 a memory brief (goal)                 Quality loop (:3003) — generic engine
        │                              pipelines/ orchestrators/ core/
        │  (loop UI run form, brief-routable)
        │  OR  POST /designs { goal }  on agentic-system (:3007)
        ▼
 ┌───────────────────────────┐  POST /runs { pipeline: "memory-architecture",
 │  agentic-system (:3007)    │                goal, recall: true }
 │  MemoryDesignDriver        │ ─────────────────────────────────▶ ┌──────────────────────────┐
 │  (brief in, no studio)     │                                    │ memory-architecture       │
 │                            │   the run (read it back)           │  derive rubric (6 kinds)  │
 │  DesignsService / cycle    │ ◀───────────────────────────────── │  → generate the strategy  │
 │  CYCLE_STORE (Postgres)    │                                    │  → 6 critics → 2 evaluators│
 │                            │  POST /orchestrations/memory-design/from-run { runId }
 │                            │ ─────────────────────────────────▶ memory-design orchestrator
 │                            │                                     target → known → digest → store
 │  HttpBusEventSink          │                                     (faceted by dimension)
 └─────────┬──────────────────┘
           │ POST /events  design.started/revised/stored  +  interaction.prompted
           ▼
   notifications bus (:3005) ─▶ Dispatcher ─▶ telegram.agentic-system (@enfav_agentic_system_bot)
```

The strategy is read from the loop **run** (`GET /runs/:id`), rendered as
markdown. There is no studio canvas and no write-back — a memory strategy is not
a node/edge drawing.

---

## 3. The artifact — a memory strategy

Its schema, `memoryStrategySchema`, lives in
`packages/contracts/src/lib/agentic-system/strategy.ts` (modeled on the
`agentic-design` pipeline's shape) — the pipeline writes and judges a strategy,
and the agentic-memory runtime executes one, so neither owns it alone; the
pipeline's `output.ts` keeps where a judge finds each part. Three load-bearing
sections that must agree:

- **registers** — the memory the system keeps: `{ name, kind (the five above),
term (short/long), holds, store, scope, metadata[], lifecycle }`.
- **interfaces** — the typed Memory Service operations over the registers:
  `{ operation (remember | recall | update | invalidate | consolidate), register,
input, output, guarantee }`. The `memory-designing.md` Memory Service API, as a
  contract bound to a register.
- **workflows** — `{ name, kind (recall_routing | write_pipeline |
consolidation_promotion | expiry), steps[] }`, where each step names an
  operation a declared interface provides on a declared register.

Plus `summary`, `assumptions`, `safeguards { rule, mechanism }`, `tradeoffs`,
`risks`. Interfaces and workflows are deliberately redundant: a step that invokes
an operation no interface declares, or an interface on a register no register
keeps, is a dangling reference the validators catch. **Validators**
(`validators.ts`): `references` (block) — the contract's
`validateStrategyReferences` (every reference resolves, no duplicate register),
the same rule the runtime compiles with; `coverage` (warn) — every register and
interface is exercised by a workflow; `executability` (warn) — whatever the
agentic-memory runtime cannot run as written (a consolidation it cannot route, a
register nothing can write, read or forget, a consolidate with no effect, metadata
that is not a field), by the runtime's own analysis, `analyzeStrategy` in the
contracts. Its notes become remediations, so the coach revises against them in the
runtime's words, and every lens reads them.

---

## 4. The pipeline

`PipelineDefinition<MemoryStrategy>`, all declarative data:

- **`goalSource: 'brief'`** — the brief is the goal; the pipeline is routable from
  the loop UI run form, and the agentic-system service passes the brief in the
  request. (It is no longer the studio's canvas pipeline.)
- **`controller: STANDARD`** — a generated strategy can be accepted, revised,
  rejected or escalated (unlike the canvas coach, which only ever revised a
  human's drawing).
- **producer** `consumes: ['memories', 'setbacks']` — it recalls prior
  memory-design lessons but not the criteria, so a first draft meets the brief
  rather than echoing its own answer key.
- **Six criterion kinds, each earning one dimension** (every dimension earnable —
  the `[QL-1]` invariant):

  | kind             | dimension     | weight | gate    |
  | ---------------- | ------------- | ------ | ------- |
  | `capability`     | completeness  | 0.18   | no      |
  | `recall_target`  | retrieval     | 0.22   | no      |
  | `ingestion_rule` | ingestion     | 0.22   | no      |
  | `scoping_rule`   | scoping       | 0.15   | no      |
  | `lifecycle_rule` | **lifecycle** | 0.15   | no      |
  | `constraint`     | governance    | 0.08   | **yes** |

  **`lifecycle` is its own dimension** so long- vs short-term management,
  consolidation/promotion and expiry are graded as a first-class axis — the
  owner's emphasis.

- **Six critics + two evaluators** (`.md` personas, imported `?raw`), written
  about the shape of a memory strategy, naming no vendor as a rule. Critics:
  `capabilities`, `recall`, `ingestion`, `scoping`, `grounding` (interface/workflow
  coherence), `governance`. Evaluators: `requirements`, `qualities`.
- Caps + field bounds seeded then **measured** from real runs (`measured.json`,
  `pnpm measure:bounds`), held by `definition.spec.ts`.

The lenses encode `docs/memory/memory-designing.md`: the five memory patterns and
per-type storage (§3), the seven-step write pipeline capture → extract → classify
→ resolve → reconcile → persist → maintain (§4), hybrid recall with query routing
/ rerank / token budget (§5), the long/short-term lifecycle, and the typed Memory
Service API with "facts / events / state / procedures aren't interchangeable".

---

## 5. The service — `packages/agentic-system` (:3007)

The "application" layer; holds everything domain-specific so the engine does not.

- **`POST /designs { goal }`** records a cycle keyed by `goalDigest` (the brief's
  digest; the brief itself stays on the coach run) and fires the
  cycle off the request path. **`GET /designs/:id`** polls it. Read the finished
  strategy from the loop run named by the cycle's `designRunId`.
- **The cycle** (`designs/`): read nothing from a studio — the goal is in the
  request; `coach(goal)` runs the `memory-architecture` pipeline (recall on),
  returns the run id; `learn(runId)` hands the finished run to the `memory-design`
  orchestrator and waits for it. A cycle is `coached` only once the coach run
  completed and `stored` only once the orchestration has stored its lessons; a
  run or an orchestration that ends any other way fails the cycle, its note
  naming how. No studio read, no canvas write-back.
- **The catalog** (`catalog/`): declared reference data for the memory stack —
  each component's interface, operations, and the **memory types** it serves
  (`memoryTypes` / `componentsByMemoryType`). Decoupled from the studio canvas (no
  node kinds). It names vendors because that is its content; the lenses name none.
- **Memory spaces** (`memory/`): `POST /spaces { runId }` compiles a finished
  run's strategy into a space the agentic-memory runtime executes — remember,
  recall, update, invalidate, history and consolidate over Postgres and a
  pgvector projection in that same database. See
  [memory-runtime.md](memory-runtime.md).

---

## 6. Learning, faceted by dimension

The `memory-design` orchestrator's digest step reads the memory-architecture
pipeline's dimension map, so the knowledge items it stores carry the dimension
(`retrieval`, `ingestion`, `lifecycle`, …) as a facet — lessons grouped by the
level of memory they are about.

---

## 7. Observability — the bus and the dedicated bot

Every transition is announced on the notifications bus twice, fire-and-forget: a
machine record on its `design.*` topic (source `agentic-system`), and — for a
person — an `interaction.prompted` a channel can deliver. The generic bus stays
domain-free; a dedicated Telegram instance `telegram.agentic-system`
(`@enfav_agentic_system_bot`, `AGENTICSYSTEM_TELEGRAM_API_KEY` /
`AGENTICSYSTEM_TELEGRAM_BOT_ID`) carries the `agentic-system` source. A brand-new
bot cannot message a chat until that chat has pressed Start on it once.

---

## 8. Why the engine stays generic

Nothing in `packages/quality-loop/src/core/` changed. Memory best practice lives
in lens personas; the dimensions, kinds, finding types, weights and the
governance gate are data on the definition; the artifact and its validators are
the pipeline's own folder; the controller is deterministic and declared. A new
judging subject is a new folder plus one registry line.

---

## 9. Running it

```bash
pnpm stack:db && pnpm db:migrate      # datastores + schema
pnpm quality-loop:serve               # :3003 (needs a Claude Code subscription login)
pnpm agentic-system:serve             # :3007 (optional — the loop UI can run it directly)
pnpm notifications:serve              # :3005 (optional; Telegram + bus)

# run it, either way:
#   loop UI run form → pick "memory-architecture" (brief-routable) → paste the brief
#   OR  POST http://localhost:3007/designs { "goal": "<a memory brief>" }
# read the strategy from the run:  GET http://localhost:3003/runs/<designRunId>
# execute it:                       POST http://localhost:3007/spaces { "runId": "<designRunId>" }
```

A ready brief is at `packages/quality-loop/prompts/agentic-memory/agentic-memory-service.md`.
Re-pin bounds after live runs with `pnpm measure:bounds --since=<ISO-with-Z>` (the
datetime must carry a `Z` or it is parsed as local time), then restore every
fixture except `memory-architecture/measured.json`.

---

## 10. Live run — worked example

First end-to-end run on the reframed pipeline, 2026-10-17 (`maxIterations 1`):

- **Generated a real strategy, not a diagram:** 5 registers — `working_state`
  (working / short-term), `semantic_fact`, `episodic_record`, `procedural_playbook`,
  `relational_graph` (all long-term); **12 typed interfaces**
  (`remember/recall/update/invalidate/consolidate` bound to registers, e.g.
  `consolidate(episodic_record)`, `recall(procedural_playbook)`); **4 workflows** —
  query-type-aware recall routing, a capture-to-persist write pipeline, an
  episode→lesson→procedure promotion, and a TTL/supersede-expiry/reindex sweep.
- **Graded on all six dimensions** (overall 48.6): completeness, retrieval,
  ingestion, scoping, governance, and **lifecycle (33.3)** — the new axis is live.
- The `references` and `coverage` validators ran and passed; the critics produced
  32 remediations; the `STANDARD` controller returned `revise`. No node/edge
  citations — the lenses judge registers, interfaces and workflows.

---

## 11. The runtime — executing a strategy

Phase 2 is `packages/agentic-memory`, a library this service mounts at `/spaces`.
It compiles a strategy's typed declarations — registers, interfaces and the
consolidation route, never its prose — under a declared policy into a space, and
runs the typed Memory Service over Postgres, the truth, and a pgvector projection
(a table in the same database, since 12 Nov 2026) that is rebuilt from it. It is
a separate bounded context from the loop's own
grading memory, which it never reads or widens. How it works:
[memory-runtime.md](memory-runtime.md).

---

## 12. File map

- Pipeline: `packages/quality-loop/src/pipelines/memory-architecture/`
  (`output.ts`, `validators.ts`, `definition.ts`, `definition.spec.ts`,
  `measured.json`, `lenses/*.md`)
- Service: `packages/agentic-system/` (`src/catalog/`, `src/designs/`, `src/memory/`)
- Orchestrator: `packages/quality-loop/src/orchestrators/memory-design/`
- Brief: `packages/quality-loop/prompts/agentic-memory/agentic-memory-service.md`
- Telegram binding: `packages/notifications/config/channels/telegram.json`
- The rubric's source material: `docs/memory/memory-designing.md`
- The strategy's schema and reference rule: `packages/contracts/src/lib/agentic-system/{strategy,strategy-validator}.ts`
- Runtime: `packages/agentic-memory/` ([memory-runtime.md](memory-runtime.md))
