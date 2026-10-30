# Lifecycle and hooks in `quality-loop` — what fires, who listens, and how the applied-to record stays outside

Two questions, answered from the code as it stood on 2026-10-16 (branch
`template/pipelines-with-samgov-systemdesign`, e77958fc plus the uncommitted
agentic-system work):

1. **How do lifecycle hooks work in `quality-loop`, and where is the eventful,
   decoupled design implemented?**
2. **How does the job-application process verify, through an API, that a
   company was already applied to — and what part does `quality-loop` play?**

The short answers:

- The engine has exactly two host callbacks, both synchronous functions handed
  in through `RunDeps`: `sink` (every attributed model exchange) and the
  optional `onIteration` (the run's standing after each finished iteration).
  Everything else a run does for the outside world — the Postgres row, the
  heartbeat, the dump, the janitor, `GET /runs/:id` — is the host's adapter
  around those two callbacks. The engine publishes nothing on the
  notifications bus; a consumer learns a run's outcome by polling.
- `quality-loop` never calls the job-application service. `browser-session`
  asks each advisor the mission names (`GET /advisor`, `POST /advice`) before
  every plan, composes the answer into the step goal as declared facts, and
  `quality-loop`'s browser-step `limits` validator cuts a `taskStart` on a
  **forbidden** unit from those facts alone. The session then refuses any
  `taskStart` on **any** unit on record, listed in the goal or not. The record
  itself is fed by the session's bus events (`session.unit.opened`,
  `session.unit.closed`, …), which job-application subscribes to.

How this was verified: seven readers mapped one subsystem each, seven
verifiers re-read every `file:line` anchor (1,021 in all; nine were off by a
line and are corrected here), and a completeness pass looked for mechanisms
the maps missed. Line numbers are 1-indexed and exact for the commit above;
after an edit, search for the symbol.

Related pages: [`reference.md`](reference.md) (the package folder by folder),
[`domain-rules.md`](domain-rules.md) (the advisor path walked as a story),
[`../job-application/overview.md`](../job-application/overview.md) (the
record and its lattice), [`../pipelines/overview.md`](../pipelines/overview.md)
(how the studio drives runs).

---

## 1. The engine's hooks (`core/`)

`runPipeline(definition, input, deps)` is the whole surface a host gets.

| Extension point                     | Where                                                                    | What it is                                                                                                                                                                                                                                                                                                             |
| ----------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RunDeps`                           | `packages/quality-loop/src/core/loop/run-pipeline.ts:67-71`              | `llm` (the model port), `sink: ExchangeSink`, `now: () => number`, `onIteration?: IterationListener`. Nothing else crosses from a host into the engine.                                                                                                                                                                |
| `IterationListener`                 | `run-pipeline.ts:65`                                                     | `(progress: RunProgress) => void`. Synchronous on purpose: the loop never waits on what the host does with it; a host that writes somewhere slow queues the write itself (the comment at `:59-64`).                                                                                                                    |
| the firing point                    | `run-pipeline.ts:162-163`                                                | after every iteration lands: `standing = progressOf(head, iterations)` then `onIteration?.(standing)`. An adopted iteration fires it too, before any stage ran.                                                                                                                                                        |
| `ExchangeSink`                      | `packages/quality-loop/src/core/ports.ts:218`                            | `(exchange: LlmExchange) => void`, the required callback. `materialize` wraps the one host client once per stage (`materialize.ts:38-41`) through `scopeLlm`, which stamps `scope` and an ordinal onto every call before forwarding it (`scoped-llm.ts:11-13`). Scopes are `criteria`, `producer` and `<lensId>.s<N>`. |
| the stage ports                     | `ports.ts:188` (`Stages`)                                                | `CriteriaDeriver`, `Producer`, `Validator[]`, `Critic[]`, `Evaluator[]`, `Controller`. The engine calls the definition; a definition never receives the engine, so it cannot call back.                                                                                                                                |
| `Controller.decide`                 | `ports.ts:181-185`                                                       | synchronous by type: no model, clock or I/O can be awaited inside a decision.                                                                                                                                                                                                                                          |
| declarations the engine branches on | `core/pipeline.ts:71, 86, 128`; `waves.ts:37-38`; `iteration.ts:118-120` | an evaluator's `consumes` picks its wave; a producer's `consumes` picks its briefing; a validator's `gate` decides admission; `refoundEvidence` is an optional pass the engine runs before the controller. No pipeline id appears in `core/loop`, `core/stages`, `core/controllers` or `core/evidence`.                |
| boot refusal of dead declarations   | `core/validate-pipeline.ts` (called at `run-pipeline.ts:79`)             | `withholds` on a block validator, an evaluator consuming findings with no critic, unknown kinds, reserved ids, a controller consulting the engine's own factor, a schema a strict endpoint would refuse.                                                                                                               |
| the shared "best" rule              | `core/loop/progress.ts:19, 25, 42`                                       | `beats`, `bestOf`, `progressOf`. The store reads a still-running run back through the same `progressOf` (`modules/runs/persistence/from-rows.ts:127`), so loop and reader cannot crown different bests.                                                                                                                |

One iteration, in order (`core/loop/iteration.ts`): `producer.produce` (`:88`)
→ `output.normalize` when declared (`:100`) → every `validator.validate`
(`:118`; a failing `block` gate keeps the artifact from the lenses) →
`output.locate` / `output.render` (`:126-127`) → the lens waves (`:152`) → the
deterministic normaliser → the declared `refoundEvidence` pass (`:224`) →
`controller.decide` (`:199`). The loop driver (`run-pipeline.ts:145-171`)
crowns the best, publishes the standing, and either goes round again in the
mode decided or stops with a reason it owns (`accepted`, `rejected`,
`escalated`, `plateau`, `max-iterations`, `produce-lost`).

What keeps `core/` decoupled is checked, not assumed:
`tooling/quality-loop-guarantees.spec.ts:63` fails the build on `Date.now`,
`Math.random`, `node:fs` or `process.env` in any non-spec file under `core/`.
The folder imports `@sysdesign/contracts`, `@sysdesign/llm`,
`@sysdesign/run-dump` (`capText` and a type), `zod` and its own siblings;
no `@nestjs` or `@mikro-orm` symbol appears there.

The vocabulary, so the three words stop blurring: `RunProgress` is
`RunTrace & { stopReason: null }` (`core/contracts/run-record.ts:17`), the
standing while the run goes on; `RunTrace` is the settled trace with its stop
reason; `RunRecord` (`run-record.ts:40`) is the host's record around it —
the wire DTO plus the full exchanges and the git context — and it carries
`heartbeatAt` (`:84, :99`), which the host mutates.

---

## 2. The host side of a run (`modules/runs/`)

`RunRecorder` is the one adapter that knows both the engine's callbacks and
the host's ports.

```
POST /runs ──► RunsService.start (runs.service.ts:144)
                 assertRubric · assertRecall · resolveAdoption · open (:276, repository.open :310)
                 202 { runId, status: running }   ← the row exists before the loop starts
                 void this.perform(...)            (:150, detached)
                   │
                   ▼
               RunsService.perform (:355)
                 new RunRecorder(record, ports, janitor.staleAfterMs)   (:361)
                 recallLessons → recorder.onRecall                       (:373-376)
                 runPipeline(definition, input,
                   { llm, sink: recorder.sink, now: Date.now, onIteration: recorder.onIteration })   (:378-388)
                 catch → recorder.fail(error)                            (:392)
                 finally → recorder.close(describePipeline(definition))  (:394)
```

| Hook or write      | `RunRecorder` (`modules/runs/run-recorder.ts`)                                                                                                 | Port                                                                      | Postgres adapter (`persistence/mikro-orm-run-repository.ts`)                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| heartbeat ticker   | `:48-55` — `startPeriodic({ everyMs: heartbeatEveryMs(staleAfterMs), atStart: false })`; each tick bumps the in-memory beat and writes         | `RunRepository.heartbeat` (`core/ports.ts:241`)                           | `:87` — `nativeUpdate` guarded by `status: 'running'`                                                                                                                                                                        |
| every exchange     | `:59` — `sink` pushes the exchange, summarises them all, queues the write                                                                      | `recordExchange` (`ports.ts:239`)                                         | `:65` — same guard, refreshes `heartbeatAt`                                                                                                                                                                                  |
| every iteration    | `:68` — `onIteration` sets `record.trace = progress`, queues the write                                                                         | `recordProgress` (`ports.ts:248`)                                         | `:93` — locks the running row, returns silently when it is no longer running, replaces the child rows with the standing's iterations                                                                                         |
| the recall's moves | `:74` — `onRecall`, before any stage runs                                                                                                      | `RunRecallRecorder.recordRecall` (`modules/runs/recall/run-recall.ts:36`) | `:76` — kept out of `core`'s port because the engine never records or interprets a recall; one adapter answers both tokens (`runs-persistence.module.ts:31-32`, `useExisting`)                                               |
| the write chain    | `:118-125` — `write()` beats, chains the task onto one promise so order is kept, and turns a failure into a warning. The loop never awaits it. |                                                                           |                                                                                                                                                                                                                              |
| close              | `:93-112` — stop the ticker, settle `finishedAt` and `heartbeatAt`, save the dump, drain the chain, then one terminal transaction              | `close` (`ports.ts:255`) → `CloseOutcome` (`ports.ts:228`)                | `:108-134` — `refused` when the row is missing or terminal, `reclaimed` when the janitor had failed it as `Interrupted` (`conventions.ts:48-52`), else `closed`; child rows replaced only when the trace is settled (`:133`) |
| the dump           | `:98` — `traces.save(record, summary)` before the row is touched                                                                               | `TraceStore` (`ports.ts:211`)                                             | `DumpTraceStore` (`modules/runs/dump-trace-store.ts:15, 20`), which never throws                                                                                                                                             |

Reading it back: `GET /runs/:id` (`runs.controller.ts:38`) answers from
Postgres; a header without its verdict columns is rebuilt as a standing by
`progressOf` (`from-rows.ts:117-127`). `GET /runs/:id/dump`
(`run-dump.controller.ts:35, 51`) reads the folder, and the two stores may
legitimately diverge (`:21`). `POST /runs` is `202` (`runs.controller.ts:20-21`)
because the run is minutes long and the caller polls.

Wiring is Symbol tokens bound outside `core/`: `modules/runs/tokens.ts:2-11`;
`TRACE_STORE → DumpTraceStore` (`runs.module.ts:35`),
`RUN_REPOSITORY → MikroOrmRunRepository` (`runs-persistence.module.ts:31`).
The memory module reaches the runs module without an import cycle through
`RunRecallSlot` (`recall/run-recall.ts:71-82`): `RunsModule` provides it empty
(`runs.module.ts:38`) and `MemoryRunRecall.onModuleInit` binds into it
(`modules/memory/memory-run-recall.ts:35-36`), so a composition without the
memory module still runs.

Two more hosts drive the same engine with other adapters: `main.js run` boots
the full `AppModule` as an application context and awaits
`RunsService.execute` (`cli/run.ts:71-81`); `main.js replay` boots
`ReplayModule` — `DbModule`, `PipelinesModule`, `RunsPersistenceModule`, no
model, no janitor, no HTTP (`modules/app/replay.module.ts:12-13`) — and
re-decides recorded ledgers through the same `RUN_REPOSITORY` port
(`cli/replay.ts:135-156`).

Gates that run before the row exists (`runs.service.ts`): every pipeline is
validated at boot (`:80`); `assertRubric`, `assertRecall` and
`resolveAdoption` refuse as `400` before `open` (`:144-149`), so the engine's
own throw at `run-pipeline.ts:80-82` is a backstop, not the path.

---

## 3. Liveness and process lifecycle

| Hook                               | Where                                                                                                         | What happens                                                                                                                                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OnModuleInit` / `OnModuleDestroy` | `modules/janitor/run-janitor.ts:26, 37, 48`                                                                   | `RunJanitor` sweeps once at init, then on a `startPeriodic` timer that never holds the process open; `onModuleDestroy` awaits the sweep in flight before the ORM pool closes.                                                    |
| the sweep                          | `run-janitor.ts:59-63`                                                                                        | `before = now − staleAfterMs`; `failStale(before)` on both ledgers under `Promise.allSettled`, so one failing ledger still lets the other report its count.                                                                      |
| the threshold                      | `modules/janitor/stale-after.ts:17-22, 31, 43-45, 53-54`                                                      | `QUALITY_LOOP_RUN_STALE_AFTER_MS` (default 180 000 ms) read once; the sweep interval equals the threshold; the beat is `max(1000, threshold / 3)` — the one cadence the ticker keeps and `/health` reports.                      |
| what a sweep writes                | `mikro-orm-run-repository.ts:176-184`; orchestration twin `mikro-orm-orchestration-run-repository.ts:102-121` | header only: `status: failed`, `error: Interrupted`; recorded iterations stand. The orchestration sweep skips a stale row whose child run is still beating (`:113`) and closes its steps as `interrupted` (`:120`).              |
| reclaim                            | `mikro-orm-run-repository.ts:122`                                                                             | the owner's late `close()` overwrites a swept row with the truth (`reclaimed`); every live write is guarded by `status: 'running'`, so nothing else resurrects a swept row.                                                      |
| `/health`                          | `modules/app/health.controller.ts:22-27`                                                                      | `{ status: 'ok', llm: { model }, heartbeat: { heartbeatEveryMs, staleAfterMs } }` from the janitor's own options (`stale-after.ts:57`). Status is unconditional; it probes neither Postgres nor Qdrant.                          |
| `OnModuleInit` (memory)            | `modules/memory/memory.service.ts:94-95`; `memory-run-recall.ts:35-36`                                        | `store.verify()` ensures the collection and payload indexes (a not-ready store is a warning, never a failed boot); the recall binds itself into the runs module's slot.                                                          |
| boot order                         | `main.ts:24, 32, 47`; `boot.ts:39, 48-49`                                                                     | `uncaughtException` handler → `preflight` (validates the threshold, then the provider's own login check; `replay` skips both) before any Nest module → `enableShutdownHooks` → `listen`. A preflight failure prints and exits 1. |
| shutdown                           | `main.ts:48`; `run-janitor.ts:48`                                                                             | `serve` only: SIGTERM/SIGINT → `onModuleDestroy` (janitor stops) → `onApplicationShutdown` (MikroORM closes). `main.js run` reaches the hooks only through `app.close()` in `finally` (`cli/run.ts:81`).                         |
| the column                         | `packages/db/src/migrations/Migration20260929300001_run_heartbeat.ts:13-15`                                   | `heartbeat_at timestamptz not null` on `quality_run` and `orchestration_run`, back-filled from `updated_at`.                                                                                                                     |

The scheduling primitive is one shared helper, `startPeriodic`
(`packages/contracts/src/lib/periodic.ts:18`): it never overlaps a slow run,
`stop()` resolves after the run in flight, and the timer is `unref`'d (`:46`).
The same helper drives the janitor, the run and orchestration tickers, the
browser session's beat, the notifications bus and govcon.

Who reads the beat: the janitor; `loop-client`'s `awaitRun`
(`packages/loop-client/src/await-run.ts:56-68`), which takes `staleAfterMs`
from `/health` rather than a copied constant (`:39`) and throws
`LoopRunStale` when a running row stops beating (`:67`); `awaitOrchestration`
(`:87-110`), which judges liveness off the running step's child run because
the orchestration DTO carries no beat; and the studio, which proxies `/health`
and the run's `heartbeatAt` to its own client.

Things a reader should know, measured in the code rather than remembered:

- A SIGTERM mid-run stops the janitor and closes the ORM while the run is
  still in flight; its remaining writes fail as warnings
  (`run-recorder.ts:54, 123`) and the row stays `running` until a later
  process's sweep fails it. That is the designed ownership rule
  (`run-janitor.ts:19-23`), and it means readers may see `running` for up to
  the threshold after a restart.
- The sweep interval equals the threshold, so in the worst case a dead run is
  reported `running` for close to two thresholds (about six minutes by
  default).
- The janitor's interval cadence is not integration-tested: every suite boots
  with `intervalMs: null` (`modules/http/testing.ts:51`) and calls `sweep()`
  by hand (`runs-liveness.spec.ts`); only `startPeriodic` itself is unit-pinned.
- `browser-session` mirrors the design with its own `LedgerPort`
  (`heartbeat`, `failStale`), its own declared timings (15 s beat, 60 s stale —
  `liveness` in `packages/browser-session/config/session/standard.json`,
  served over no route) and a sweep at the start of every session (`session-close.ts:26-28`)
  rather than a periodic janitor. Its ledger heartbeat has no status guard
  (`adapters/mikro-orm/mikro-orm-ledger.ts:121-123`).

---

## 4. The orchestration layer's lifecycle

An orchestrator is data (`orchestrators/runner/definition.ts:80`): ordered
steps, each naming the registered pipeline(s) it may run (`:65-76`), what it
needs, an optional `provided` stand-in, and zod shapes for its context and
reports. One generic runner walks the list and names no step.

| Piece                | Where                                                                                                                                  | Note                                                                                                                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OrchestrationDeps`  | `orchestrators/runner/run-orchestration.ts:29-34`                                                                                      | the runner's host seam: `ports`, `pipelines()`, `execute(child, onOpened?)`, `flush()`, `now()`, `warn()`. It never imports `RunsService`, `runPipeline` or a repository.                                                                                                          |
| the step loop        | `run-orchestration.ts:203, 239-247, 255, 258`                                                                                          | `ledger.begin` → `step.run(ctx)` → `ledger.end`; an unexpected throw → `closeOnError`; `ledger.settled()` awaited in `finally`.                                                                                                                                                    |
| `ctx.execute`        | `run-orchestration.ts:43, 118, 128, 131`                                                                                               | `chosen()` holds the pipeline to the step's declared list; the host's `onOpened` is consumed by the runner itself to append the child run id while the step is still running; the child comes back as a `QualityRunDto`.                                                           |
| `StepLedger`         | `orchestrators/runner/ledger.ts:11, 21-30, 48, 59-60`                                                                                  | patches the in-memory record and queues a whole-record flush on one serial chain at every transition; a failed flush is logged, never thrown.                                                                                                                                      |
| the Nest host        | `modules/orchestration/orchestration.service.ts:38, 73-81, 182, 189-199, 205-212`                                                      | validates every definition at boot; `start` opens the row and detaches `perform`; `perform` runs a heartbeat ticker, hands the deps inline (`execute` → `RunsService.execute`, `flush` → `repository.update`), then closes with the same `closed / reclaimed / refused` outcomes.  |
| ports                | `modules/orchestration/ports.ts:11, 20-35`                                                                                             | `OrchestratorBinding` is the `{ definition, ports }` pair the module builds from the bundle each definition declares — not the runner's seam. `OrchestrationRunRepository` has `update`, `heartbeat`, `close`, `failStale`.                                                        |
| routes               | `modules/orchestration/orchestration.controller.ts:26, 37, 48, 56`                                                                     | `POST /orchestrations/:orchestrator`, `POST …/from-run` (both `202`), `GET /orchestrations`, `GET /orchestrations/:id`; `openedBy` rides as data on every child request.                                                                                                           |
| reading a child back | `core/outputs/run-outputs.ts:31, 61, 74`; `core/outputs/readout.ts:18`; `core/outputs/reconcile.ts:104`; `orchestrators/common.ts:121` | `outputsOf`, `admission` (with the pipeline's own `acceptAt` from the registry), `reconcile` (tallies, holds no threshold).; `readoutOf` (`readout.ts`) is the one reading of a settled run's admission at its effective bar and its withheld locations, served on `GET /runs/:id` |

There is **no step-level listener** analogous to `onIteration`. The only
callback the runner accepts, `onOpened`, it consumes itself (`:128`).
Orchestration progress is published solely by persisting the record at each
transition (`flush` → `OrchestrationRunRepository.update`,
`mikro-orm-orchestration-run-repository.ts:39-41`, guarded by `running`) for
clients to poll. Heartbeat for an orchestration row has three writers: the
ticker (`orchestration.service.ts:195-200`), every ledger flush (`update`
refreshes it), and the sweep's proof-of-life through a still-beating child
(`:113`).

---

## 5. Where the events are: the seams between packages

`quality-loop` publishes nothing on the notifications bus and owns no
subscriber. The run seam is **pull**: `POST /runs` → `202` → poll
`GET /runs/:id` through `LoopClient` (`packages/loop-client/src/loop-client.ts:27-32`)
and `awaitRun`. Consumers: `browser-session`'s `LoopBrain`
(`adapters/loop-http/loop-brain.ts:140, 150`), the studio, and the
agentic-system driver.

The eventful leg is `browser-session → notifications bus → job-application`:

| Piece                  | Where                                                                                                                                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the topics             | `packages/contracts/src/lib/units/session-events.ts:16-20` — `session.started`, `session.unit.opened`, `session.unit.closed`, `session.ended`; declared to the bus with their schemas at `packages/contracts/src/lib/notifications/topics.ts:30-33`                              |
| the port and the queue | `packages/browser-session/src/core/session-events.ts:19` (`SessionEventsPort`), `:41` (`createSessionEvents`: its own write queue so a bus riding out a restart never holds a task row), `:55-56` (`drain(windowMs)`)                                                            |
| the builders           | `session-events.ts:70, 83, 92, 106`                                                                                                                                                                                                                                              |
| where they fire        | `core/session-engine.ts:111` (started, right after `openSession`), `core/step-executor.ts:130` (unit opened, at `taskStart`), `:175` (unit closed, at `taskDone`), `core/session-close.ts:57` (ended, first thing in the close)                                                  |
| the drain              | `session-close.ts:78-81` — one window (`eventsDrainMs` = the bus recovery window), then what stayed unsent is warned and recorded in the dump manifest (`:102`)                                                                                                                  |
| the adapter            | `adapters/notifications-http/bus-session-events.ts:8-12` — publishes each event with source `browser-session`; bound at `modules/session/session.module.ts:171`                                                                                                                  |
| the bus                | `packages/notifications/src/bus/bus.ts:50` (publish: schema and publisher checked, appended in seq order, waiting pulls woken), `:74` (subscribe), `:93` (long-poll pull), `:120` (ack, forward only)                                                                            |
| the subscriber         | `packages/job-application/src/intake/session-events.consumer.ts:45, 57, 68-96, 101-103, 111-118` — `SessionIntake` subscribes as `job-application.sessions` to every session topic, then loops pull → `apply` → ack; `config/intake/standard.json` (25 s wait, 20 events a pull) |
| its lifecycle          | `intake/intake.module.ts:22` — `IntakeLifecycle implements OnApplicationBootstrap, OnModuleDestroy`                                                                                                                                                                              |
| the repair path        | `core/session-events.ts:116` (`sessionEventsOf` rebuilds a session's events from its rows) → `pnpm browser-session replay-events <id>` (`src/cli.ts:212`)                                                                                                                        |

Other publishers on the same bus, for the pattern: the agentic-system's
`HttpBusEventSink` (`packages/agentic-system/src/designs/events/http-bus-event-sink.ts`,
fire-and-forget, no queue or drain) and govcon's alert sink
(`packages/govcon/src/modules/alerts/bus-alert-sink.ts`).

Reliability facts worth knowing before trusting the record blindly:

- Delivery is at-least-once with ack-after-apply, and the `apply` try/catch
  wraps the store writes too (`consumer.ts:68-98`): any failed apply — a
  transient database error included — is logged and the event is acked at
  `:118`, so it is lost until `replay-events`.
- The bus sweeps a subscription idle for a day; the intake then resubscribes
  at the head and warns once that a gap may exist (`consumer.ts:122-129`).
- A replayed event is stamped with the replay's `publishedAt`
  (`consumer.ts:69`), so replaying a close re-sets `closedAt` and moves the
  90-day window; replay is idempotent only under exact redelivery.
- `browser_task` rows hold the same facts the events carry (facets, outcome),
  which is what makes the replay possible; the job-application table is the
  advisor's read model, not the only copy.

---

## 6. The already-applied check, hop by hop

The direction of every call, with the file that proves it:

```
mission (## Unit identity, ## Advisors)      environment (UNIT_ADVISOR_URLS)
          │                                            │
          ▼                                            ▼
 browser-session ── GET /advisor, POST /advice ──► job-application (:3006)   read side
          │                                              ▲
          │ goal: "## Units of work" prose, "## Limits" line,                │ bus: session.unit.opened / closed
          │       fenced index { unitFacets, unitsForbidden, onRecordTaken } │
          ▼                                              │
     quality-loop (:3003)  browser-step limits validator  │
          │  cuts a taskStart on a forbidden identity     │
          ▼                                              │
 browser-session refusedOnRecord at taskStart ───────────┘   write side, via the notifications bus
```

1. **Boot.** `SessionModule` builds one `HttpUnitAdvisor` per
   `UNIT_ADVISOR_URLS` entry (`packages/browser-session/src/modules/session/session.module.ts:94, 166`;
   the variable at `src/config.ts:82`, grammar `[<id>=]<url>` at `:142`).
   `resolveAdvisors` runs before any row exists
   (`core/session-engine.ts:88` → `core/unit-advice.ts:185`): it reads the
   mission's `## Unit identity` and `## Advisors` sections
   (`packages/contracts/src/lib/units/mission-identity.ts:31-32, 101, 105`),
   refuses a session with advisors but no declared subject (`:202`), calls
   `GET /advisor` to learn who each advisor is and which facets it keeps
   (`:206`, `http-unit-advisor.ts:65`), refuses an advisor keyed by a facet
   the mission does not declare (`:220`), and asks each once as step 0
   (`:228`).
2. **Every step.** `decide()` calls `recallAdvice` before `planStep`
   (`core/step-flow.ts:114`). The request is
   `{ subject, asker: { kind: 'browser-session', id: sessionId, label }, facets }`
   (`unit-advice.ts:129-136`); `HttpUnitAdvisor.recall` posts it to
   `ADVISOR_ROUTES.advice` (`http-unit-advisor.ts:75`; routes declared at
   `packages/contracts/src/lib/units/advice.ts:28`). An advisor that faults
   opens a streak: the goal is composed from its last good advice and it is
   probed once a step until it answers (`unit-advice.ts:258-287`). The
   merged answer is `UnitsOnRecord` (`:247`).
3. **The advisor answers from its record.** `AdvisorController`
   (`packages/job-application/src/advisor/advisor.controller.ts:22, 27`)
   refuses an asker whose facets omit any the record is kept by (`:33`), then
   `ApplicationRecordSource.unitsOnRecord` (`applications/record-source.ts:130`)
   reads the subject's rows inside the window (`:133`), drops the asker's own
   in-progress unit (`ownOpenUnit`, `:40, :134`), groups by identity key, takes
   the strongest stance per company (`:96-97`), orders `forbid` first then
   latest first (`:31, :113`), and bounds the list to 200 with the rest
   counted (`:138-139`; `ADVICE_UNITS_BOUND`, `contracts/src/lib/units/vocab.ts:92`).
4. **The stance is policy, not code.**
   `packages/job-application/config/policy/scatter.json`: 90-day window;
   `in-progress → forbid`; `submitted`, `submitted-before`, `abandoned`,
   `failed`, `skipped → avoid` (the last two since 2026-10-29). `standingOf` reads an in-progress
   row past its `expiresAt` as `abandoned` (`applications/policy.ts:46-50`),
   `stanceOf` applies the table (`:58-65`); `neverOnRecord` and
   `skippedBecomesAvoidAfter` are declared knobs, currently empty and `null`.
5. **The answer rides into the goal as data.** `composeStepGoal`
   (`packages/contracts/src/lib/browser-session/step-goal.ts:323`) renders
   `## Units of work` (`:340`; `step-goal-units.ts:99`), strongest stance
   first, 40 units rendered and the rest counted as "(N more on record not
   listed)" (`step-goal-units.ts:74, 90`; `UNITS_ON_RECORD_BOUND`,
   `vocab.ts:79`); a `## Limits` line per stance (`:344-349`;
   `step-limits.ts:101`); and the fenced index with `unitFacets`,
   `unitsForbidden` (`forbiddenOf`, `:329`; `units/record.ts:33`) and
   `onRecordTaken` (`:354`; `step-index.ts:233-242`). Units merely to avoid
   are prose for the planner and never an index fact (`step-index.ts:152-155`).
6. **`quality-loop` reads the facts, never the record.** The browser-step
   pipeline declares two validators (`pipelines/browser-step/definition.ts:149`).
   `limitsValidator` (`validators.ts:380-382`, an `indexedValidator` over
   `readIndex`, gate `cut`) faults a `taskStart` whose facets are not exactly
   the declared names (`:259`), one whose facets match a `unitsForbidden`
   identity (`forbiddenFault`, `:288-290`, through `matchesRecord`), and one
   declaring `onRecordTaken` where the mission grants no exception or the page
   withholds it (`takenFault`, `:301-303`); all three at `:353-357`. The
   session applies the cut: `routePlan` treats a `cut` report as positional
   (`contracts/src/lib/browser-session/route-plan.ts:59, 206-256`) and runs
   only the executable prefix (`step-flow.ts:156`).
7. **The session holds every `taskStart` to the whole record.**
   `openTaskUnlessRefused` (`core/step-executor.ts:69`) calls
   `refusedOnRecord(action, onRecord, takenStancesOf(mission))` (`:82-83`;
   `contracts/src/lib/browser-session/step-record.ts:68-75`), which finds the
   strongest-stance match by `matchesRecord` and refuses unless the stance is
   one the mission's `## Taking a unit on record` section lets a plan take
   (`units/mission-taken.ts:34, 94`) **and** the plan declared
   `onRecordTaken: true`. A hit opens nothing, records a not-executed history
   line and an objection, and counts a `unit-refused` failure (`:215-216`).
   This holds for units past the 40 the goal had room to render.
8. **Sameness is one key.** `facetKey` trims, NFKC-normalises and lower-cases
   under `en-US` (`contracts/src/lib/units/identity.ts:49-50`);
   `identityKey` sorts facets by name (`:56`); `matchesRecord` compares keys
   (`:106`). The validator and the record share it, so they cannot disagree;
   the same key scopes per-unit form memory (`unitKeyOf`, `:102`).
9. **The write side.** A unit that opens publishes `session.unit.opened`
   with its id, facets and `maxMinutes` (`step-executor.ts:130`); `taskDone`
   publishes `session.unit.closed` with the outcome (`:175`). `SessionRecord`
   (`job-application/src/applications/session-record.ts`) turns them into a
   monotone lattice of `job_application` rows: `started` abandons another dead
   session's in-progress units on the same profile and subject (`:30-36`),
   `opened` inserts `in-progress` with `expiresAt = at + maxMinutes` (`:40-48`,
   idempotent by unit id), `closed` maps the outcome through
   `TASK_OUTCOME_APPLICATION_STATUS` (`:53-56`; `done → submitted`,
   `already-done → submitted-before`; `contracts/src/lib/job-application/vocab.ts:20`),
   `ended` abandons the session's own open rows (`:73-75`). The next
   `POST /advice` returns that company as `avoid` or `forbid`, and the loop
   is closed.
10. **A second write path exists.** `POST /applications` enters a row with
    `source: 'manual'` and `PATCH /applications/:id` corrects a status
    (`applications/applications.controller.ts:48, 56`); those rows answer
    `/advice` like any other. The 2026-10-12 backfill used it.

What is guaranteed and what is only advised (the fuller treatment is
[`domain-rules.md`](domain-rules.md), "What is guaranteed, and what is only
advised"):

- A **forbidden** unit (in progress in another live session) is refused twice
  — by the loop's validator from the index and by the session from the whole
  advice. Two paths to one answer, deliberately: the goal renders at most 40
  of up to 200 answered units, so a validator alone could not hold the record.
- An **avoid** unit (applied within 90 days) is never a validator fact. It is
  prose for the planner plus the session's refusal, which the shipped mission
  lifts when the page lists no next-page control and the plan declares
  `onRecordTaken: true` (`packages/browser-session/goals/linkedin-easy-apply.md`,
  `## Taking a unit on record`). "Applied, never again" is a preference with a
  declared exception, not an absolute.
- A **failed** or **skipped** application earned no stance until 2026-10-29,
  so it was retried, within a session and across sessions; since then both are
  avoided for the window. Observed on the 2026-10-16 run, before the change: two
  units that had failed in an earlier run were taken up again and failed the
  same way; one failed unit was re-opened within the same session. Whether a
  failure should become `avoid`, be retried only once the record changes, or
  be retried with its reason attached is a policy decision for
  `scatter.json`, not an engine change.
- The rendering bound bites. With 75 companies on record the goal lists 40;
  the planner opened units among the hidden 35 and the session refused each
  at `taskStart`, at the cost of about a step and a minute per refusal, and
  it retried the same hidden units after every return to the results page.
  The remedy under design is to render first the on-record units whose
  identity the current page names (session knowledge, no new input), ahead of
  the advisor's order.
- An advisor that faults mid-session leaves the goal on its last good advice,
  so a unit opened by a concurrent session after that answer is not forbidden
  until the advisor answers again (`unit-advice.ts:273-287`).

---

## 7. Doc drift found while mapping

None open. The five passages this map found in `reference.md` and
`memory-runs.md` were corrected on 2026-10-30.

---------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `docs/quality-loop/reference.md:352-353` | `modules/http/` holds `goalRequestSchema` with `MAX_GOAL_LENGTH` | no `MAX_GOAL_LENGTH` exists; `goal-request.ts:15` bounds by `GOAL_BUDGET_BYTES` from contracts |
| `docs/quality-loop/reference.md:434-435` | runs tokens: `QUALITY_LOOP_LLM`, `PIPELINES_TOKEN`, `TRACE_STORE`, `RUN_REPOSITORY` | `tokens.ts:7-11` also has `RUN_DUMP_DIR`, `RUN_RECALL_SLOT`, `RUN_RECALL_RECORDER` |
| `docs/quality-loop/reference.md:447-450` | live writes are exchanges plus heartbeat; one close transaction | progress snapshots per iteration, the ticker, and the `closed / reclaimed / refused` outcomes are missing |
| `docs/quality-loop/reference.md:464` | the orchestration step record is "written whole at the end" | `StepLedger` flushes every transition (`ledger.ts:64`); `docs/pipelines/memory-runs.md:437-441` has it right |
| `docs/pipelines/memory-runs.md:466` | the `interrupted` reason is raised at boot | also on every sweep interval (`run-janitor.ts:37-44`) |

---

## 8. Two paths to one answer, and exports nothing else reaches

Findings for TOP RULE 1 still open. The chained write queue, the heartbeat and
close logging, the settled-trace predicate, the host binding's name and its
untyped map were resolved on 2026-10-24, and the admission sequence on
2026-10-30 (`modules/runs/run-admission.ts`); `tooling/inert-code.spec.ts` now
also fails an export only specs reach in the quality loop.

| Kind                  | Where                                                                                                                                                                 | Note                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| threshold read ×2     | `boot.ts:48`; `modules/janitor/stale-after.ts:44`                                                                                                                     | `runStaleAfterMs` in `preflight` only to fail early, then again in the janitor's factory; same function, same answer; kept: the preflight is the fail-early read of the same declared parser, not a second rule |
| exported, single-file | the types `IterationListener`, `Produced`, `RecorderPorts`, `PipelineChooser`, `OrchestrationRunRow`, `RunHeadline`, `CallOverrun`, `StoreNotReady`, `FixedCriterion` | each names a type a public signature of its file uses; the values in this row were made file-local (2026-10-24)                                                                                                 |

---

## 9. A reader's checklist

- To watch a run live: `GET :3003/runs/<id>` while it runs — the standing is
  rebuilt from the recorded iterations; `GET :3003/health` gives the pace to
  judge `heartbeatAt` by.
- To know which units a step's goal rendered: read `request.goal` from
  `GET /runs/<runId>` (section `## Units of work`), not the dump, whose
  `plan.json` keeps only `composition.bytes`.
- To know what the advisor answered at a step: `01-steps/NN/advice.json` in
  the session dump.
- To repair a record that missed events: `pnpm browser-session replay-events <sessionId>`,
  knowing it re-stamps `closedAt`.
- To change what "already applied" means: `packages/job-application/config/policy/scatter.json`,
  never the engines.
