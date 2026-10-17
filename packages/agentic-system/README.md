# agentic-system

Designs and coaches **agentic-memory strategies** on the quality loop, and
learns from each finished run. It is the "application + durable orchestration +
human-approval" layer for the memory-design capability: it takes a memory
brief, runs the loop's `memory-architecture` coach to generate and grade a
strategy from it, and hands the finished run to the `memory-design`
orchestrator to digest and store as memory.

Nothing here judges or grades — that is the quality loop's engine. This service
is the domain: the component catalog a memory design is drawn from, and the
driver that moves a design cycle through the loop. The engine stays generic;
every memory-specific thing lives here as declared data.

## Routes

| Method | Path           | What                                                                                                        |
| ------ | -------------- | ----------------------------------------------------------------------------------------------------------- |
| `POST` | `/designs`     | Start a design cycle from a memory brief (`{ goal }`); 202 with the cycle, which runs off the request path. |
| `GET`  | `/designs/:id` | Read a cycle back: its status, the coach run, the orchestration that learned from it.                       |
| `GET`  | `/health`      | Liveness.                                                                                                   |

The coached strategy is the coach run's artifact; read it from the loop
(`GET /runs/:id`), not from this service.

## How a cycle runs

1. **Coach** a strategy from the brief: one `memory-architecture` run with
   coach-only recall (`recall: true`, a per-run flag an orchestration cannot
   carry), judged against the memory rubric the loop derives from the goal. The
   pipeline generates the strategy (registers / interfaces / workflows) from the
   brief; no output is supplied.
2. **Learn**: hand the finished run to the `memory-design` orchestrator
   (`from-run`) to digest it into typed memory, faceted by the pipeline's own
   dimensions (retrieval, ingestion, scoping, …).

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

`config/engine.json` names one file per kind under `config/<kind>/`
(`config/design/standard.json`: the pipeline, the orchestrator, the coach
iterations, whether to recall, the poll pace). Environment, read only in
`src/config.ts`: `AGENTIC_SYSTEM_PORT` (3007), `QUALITY_LOOP_URL`,
`NOTIFICATIONS_URL`.

## Notifications

Every transition is announced on the notifications bus twice: a machine record
on its `design.*` topic (`design.started/revised/stored`, source
`agentic-system`), and — for a person watching — an `interaction.prompted` a
channel can deliver. Both are fire-and-forget; a bus that is down never fails a
cycle. Reaching a person needs a channel that carries `agentic-system`: the
dedicated Telegram instance `telegram.agentic-system`
(`AGENTICSYSTEM_TELEGRAM_API_KEY`, `AGENTICSYSTEM_TELEGRAM_BOT_ID`). Without one
the prompt is still recorded on the bus, just not pushed.

Run: `pnpm agentic-system:serve` (needs the quality loop on `QUALITY_LOOP_URL`).
