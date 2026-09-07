# The quality loop (`packages/quality-loop`)

The generic quality-control loop from [overview.md](./overview.md), as a NestJS starter that runs end to end. A pipeline is data; the model returns categories and ordinals; the deterministic policy owns every number and the final decision; every run writes a dump. The studio's own grading in `eval-worker` is untouched — this package is the doctrine applied to any task, starting with a system-design prompt held in a markdown file.

## The loop, stage by stage

| Doctrine stage                | Here                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Define task contract          | `core/stages/derive-criteria.ts`: one structured extraction turns the goal (the md file, verbatim) into criteria classified by the pipeline's kinds. Ids are engine-assigned (`c1`…). |
| Generate artifact             | `core/stages/llm-producer.ts`, or a supplied `output` adopted as iteration 1.                                                                                                         |
| Deterministic validators      | `core/stages/schema-validator.ts` always first, plus any `Validator<T>` a pipeline brings. A `block` failure skips every lens.                                                        |
| Critics                       | `core/stages/llm-critic.ts`: defects with type, severity, confidence, fixability, location refs and criterion refs — all enum-locked per request.                                     |
| Evaluators                    | `core/stages/llm-evaluator.ts`: `pass                                                                                                                                                 | partial | fail  | not_applicable` per criterion of its kinds. Each kind has exactly one judge. |
| Evidence normalizer           | `core/normalize.ts`: admission, structural keys, agreement across samples, lower-middle medians, cross-lens merge, reconciliation.                                                    |
| Deterministic decision policy | `core/decide.ts`: scores, then gates in a fixed order, every step traced.                                                                                                             |
| Controller decision           | `accept                                                                                                                                                                               | revise  | retry | escalate                                                                     | reject`, plus the runner's stop reason. |
| Trace + lessons               | `core/run-pipeline.ts` returns a `RunTrace`; `dump/build-run-dump.ts` lays it out; `@sysdesign/run-dump` writes it under `static/runs`.                                               |

Everything under `src/core/` is pure: no Nest, no filesystem, no clock (`now` is injected). The Nest layer (`src/modules/`) binds the model client, the pipeline registry and the trace store.

## Running it

```bash
# one run from the command line (builds first; the dump path is printed)
pnpm quality-loop:run --pipeline system-design --goal packages/quality-loop/prompts/order-history.md
# judge a supplied artifact instead of producing one
pnpm quality-loop:run --pipeline system-design --goal prompt.md --output answer.json --iterations 1

# the HTTP surface on :3003
pnpm quality-loop:serve
curl -s localhost:3003/pipelines
curl -s localhost:3003/prompts                               # the library: one md file per prompt
curl -s localhost:3003/prompts/order-history                 # { id, title, markdown }
curl -s -X POST localhost:3003/runs -H 'content-type: application/json' \
  -d '{"pipeline":"system-design","goal":"# Prompt …"}'     # 202 { runId }
curl -s localhost:3003/runs/<runId>                          # poll until status is complete

# the service and its web client together (:3003 + :4201)
pnpm quality:start
```

| Variable                                                  | Effect                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QUALITY_LOOP_DETERMINISTIC`                              | `1` forces the no-op model. Falls back to `EVAL_DETERMINISTIC`; `0` overrides it for this loop.                                                                                                                                                                |
| `ANTHROPIC_API_KEY`                                       | The API route (with `LLM_MODEL`). Wins over the subscription route.                                                                                                                                                                                            |
| `QUALITY_LOOP_AUTH`                                       | `claude-code` runs the loop through this machine's Claude Code login via the Agent SDK.                                                                                                                                                                        |
| `QUALITY_LOOP_PORT`                                       | HTTP port, default 3003.                                                                                                                                                                                                                                       |
| `DB_HOST` `DB_PORT` `DB_USERNAME` `DB_PASSWORD` `DB_NAME` | Postgres for the run tables (`quality_run` and its children); defaults `localhost`/`5432`/`admin`/`admin`/`sysdesign`. `pnpm stack:db` listens on 5433, which `pnpm quality:start` and `pnpm quality-loop:run` default to.                                     |
| `QUALITY_LOOP_CORS_ORIGIN`                                | The browser origin allowed to call the service; default `http://localhost:4201`.                                                                                                                                                                               |
| `QUALITY_LOOP_PROMPTS_DIR`                                | The prompt library directory, read per request; default `<cwd>/packages/quality-loop/prompts`.                                                                                                                                                                 |
| `EVAL_DUMP_DIR`                                           | Where dumps go; default `./static/runs`.                                                                                                                                                                                                                       |
| `OPENAI_API_KEY`                                          | Enables embeddings for memory runs (`OPENAI_EMBEDDING_MODEL` picks the model, default `text-embedding-3-small`); the loop's determinism switch turns them off too. Loaded from `.env` by Node (`--env-file-if-exists=.env` on `serve` and `quality-loop:run`). |
| `QDRANT_URL` `QDRANT_API_KEY`                             | The vector store for memory runs; default `http://localhost:6333`, which `pnpm stack:db` starts beside Postgres.                                                                                                                                               |
| `NEXT_PUBLIC_QUALITY_LOOP_URL`                            | (web client) the service's base URL; default `http://localhost:3003`.                                                                                                                                                                                          |

Without a live model the loop is honest rather than empty: no criteria are derived, the producer cannot produce, the lenses are skipped, and the controller escalates with `llm-disabled` diagnostics and no invented number. The dump is still written.

## The HTTP surface

Every wire type lives in `@sysdesign/contracts` under `lib/quality-loop/`, so the service, the CLI and the web client share one definition; the app keeps only the zod-bound `OutputShape`/`TaskSpec` and its internal `RunRecord` (the wire run plus git context and the full exchanges).

| Route              | Returns                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------- |
| `GET /health`      | `{ status: 'ok' }`                                                                                              |
| `GET /pipelines`   | `ListPipelinesResponse` — each `PipelineSummary` (task vocabulary, lens specs, the policy)                      |
| `GET /prompts`     | `ListPromptLibraryResponse` — `{ id, title }` per markdown file, titled by its first H1, sorted by id           |
| `GET /prompts/:id` | `GetPromptLibraryDocumentResponse` — the markdown verbatim; 404 when the file is not there                      |
| `POST /runs`       | 202 `StartQualityRunResponse` — body `StartQualityRunRequest` (`pipeline`, `goal`, `output?`, `maxIterations?`) |
| `GET /runs/:id`    | `GetQualityRunResponse` — `QualityRunDto`: status, availability, the trace once complete, exchanges summarised  |
| `GET /runs`        | `ListQualityRunsResponse` — newest first; `?pipeline`, `?status`, `?limit` (default 50, max 100), `?offset`     |

`GET /runs/:id` summarises each exchange to `{ scope, ordinal, outcome, durationMs, startedAt }`; the prompts and responses are only in the dump. The prompt library is a port (`PromptLibrary`) with a filesystem adapter — a database-backed one drops in behind the same routes.

## Memory runs

`POST /memory-runs` takes exactly the run inputs (`pipeline`, `goal`, `output?`, `maxIterations?` — the last two reach the target only) and composes the three pipelines through the one `RunsService`, as a plugin over the untouched engine (`src/modules/memory/`): **recall** embeds the goal's head (cached in `memory_embedding` by model and text hash), searches the vector store for up to 16 chunks, runs `memory-recall` on them and keeps what it accepted — kept chunks no confirmed finding names, strongest support first — appended to the goal under `## Remembered evidence (advisory)` within the goal budget; **target** runs the requested pipeline on that goal; **digest** runs `experience-digest` on the finished target with the bare prompt (the advisory section is stripped, so remembered lessons are never re-digested); **store** writes one `lesson` chunk per accepted memory to Qdrant under a deterministic id per (source run, ref), so re-digesting a run replaces its chunks, in a collection bound to the embedding model and width. Every step carries a closed status and reason (`MEMORY_STEP_REASONS` in contracts): without a key the memory steps skip with `embeddings-disabled` and the target still runs; an empty store skips recall with `store-empty`; anything short of `accept` from the memory pipelines endorses nothing. `POST /memory-runs/digest { runId }` learns from a run that already happened (recall and target `provided-run`); `GET /memory-runs` and `GET /memory-runs/:id` answer from the `memory_run` table, whose row holds the step ledger, the availability the run saw and the three child run ids (each an ordinary run at `GET /runs/:id`). A row still `running` at boot is failed with `interrupted` steps. The store is verified at boot and per run and reported as data, never as a status code.

## Persistence

Runs persist through MikroORM's EntityManager the way evaluations do, in normalized tables: `quality_run` (the header and the live exchange log), `quality_run_criterion` (the derived contract), `quality_run_iteration` (one row per loop turn), `quality_run_finding` and `quality_run_criterion_result` (the ledger's two lists, each with a denormalised `run_id` for cross-run SQL). The wire record is reassembled exactly from these rows, so `GET /runs/:id` answers the same after a restart; the `RunRepository` port (`core/ports.ts`) is the seam, `modules/runs/persistence/` the MikroORM adapter and the pure mapper. The row is opened before the loop starts, exchanges flush as they are attributed, and the trace lands in one transaction when the loop ends. A run still `running` when the service boots died with the previous process and is marked failed. The dump is unchanged and remains the full audit trail. Migrations live in `packages/db` (`pnpm db:migrate`, `pnpm db:migrate:check`).

Memory runs add `memory_run` (the ledger above, with nullable references to the three child runs) and `memory_embedding` (the cache); both come from one migration. The vector store itself is Qdrant (`docker-compose.yml` service `vectors`, named volume `sysdesign-qdrant`), started and stopped with the database by `scripts/stack.sh`, reached through the `MemoryStore` port (`src/modules/memory/ports.ts`) and its adapter under `qdrant/`.

## The dump

`static/runs/<runId>-quality/`: `manifest.json`, `run.md` (the human entry point), `01-goal.md` (verbatim), `02-contract.json` (the derived criteria), `03-pipeline.json` (the definition as data), `04-iterations/NN/{iteration,artifact,validation,critics,evaluators,ledger,decision,remediations}.json` plus `artifact.md` (the text every judge read, empty when no artifact was produced), `05-llm/NN.<stage>.<ordinal>.{system.txt,user.txt,response.json,meta.json}` (every exchange, attributed by lens and sample, prompts as text so `grep -r` works), `06-lessons.json`. One row per run in `index.jsonl` with `kind: 'quality'`.

## Declaring a pipeline

A folder beside `src/pipelines/system-design/` and one line in `src/pipelines/index.ts`. The core never changes.

- `definition.ts` — the data: `criterionKinds` and `findingTypes` (id → one-line meaning shown to the model), `maxCriteria`, the producer and criteria-deriver personas, the lens specs (`id`, `persona`, `samples`, `maxItems`, `maxTokens`; evaluators add the `criterionKinds` they judge), and the `policy`.
- `lenses/*.md` — one markdown persona per lens, imported with `?raw`. The engine's `prompting.ts` adds the rules every lens obeys (cite only listed ids, answer in the schema, be complete and concise); the md says what the lens knows.
- `output.ts` — the only code: a zod `schema` for the artifact, `locate(output)` giving positional ids (`component.2`), and `render(output)` printing every id verbatim where a judge reads it.

`validatePipeline` runs at boot and at every run: weights sum to 1, every kind and type is priced onto a known dimension, thresholds and decay are in range, every lens can reach `minHits`, every kind has exactly one evaluator, no reserved or duplicate ids, and the output schema converts to JSON Schema.

Three instances exist, each a folder under `src/pipelines/`:

| Pipeline            | Artifact           | Input                                                                            | Criterion kinds                               | Dimensions                                              |
| ------------------- | ------------------ | -------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `system-design`     | `DesignAnswer`     | a prompt md                                                                      | functional, non_functional, scale, constraint | completeness, quality_attributes, compliance, soundness |
| `memory-recall`     | `MemoryPack`       | a prompt md plus candidate chunks recalled for it (`input.ts`)                   | need, admissibility                           | coverage, precision, fidelity                           |
| `experience-digest` | `ExperienceDigest` | a finished run of any pipeline, composed from its `QualityRunDto` (`compose.ts`) | signal, transition                            | attribution, fidelity, reuse                            |

A pipeline whose input is more than a prompt owns an **input codec** (`input.ts`): a typed input rendered to the goal markdown — the flexible md verbatim under its own heading, pipeline-owned sections around it, engine-assigned aliases (`m3`, `f4`, `r2`) — closing with `## Index`, a fenced JSON block the codec reads back with zod. The input schema refuses anything that would render beyond the goal budget. Every alias is a location the artifact must give a verdict to (`kept ∪ dropped`, `evidence ∪ unused`), so a finding about an item keeps its key across revisions and maps straight back to the source. **Exact checks are validators** (`validators.ts`): an alias the index does not hold, an alias placed twice, an item left without a verdict, a pack or digest over its limit — each blocks, none reads prose; both validators start from the output schema because the engine runs every validator on any artifact it has. What the goal does not state cannot become a criterion, so standing rules such as grounding and transfer are critic-checked finding types, and `experience-digest` records the engine's own facts — remediations selected, transitions from the lessons, score deltas — rather than letting a model author an effect.

## How evidence becomes a decision

**Scores.** For each dimension: criteria of the kinds mapped to it earn `resultValues[result] × kindWeight` (`unassessed` earns nothing but keeps its weight); the base is 100 × earned / total. Confirmed, unreconciled findings mapped to the dimension subtract `bySeverity[severity] × confidenceWeights[confidence]`, worst first, each decayed by `decay^position`, the total clamped to `maxPerDimension` pro rata. A dimension with nothing mapped to it is `null` and renormalises out; one with findings but no criteria starts at 100. Overall is the weighted mean of assessed dimensions.

**Gates, in order, each traced even when skipped:** artifact present → blocking validators → evidence sufficient (`minAssessedShare` of criteria assessed) → policy allowed (no finding at a blocking severity or gated type, no gated kind failed; routed by fixability: `unfixable` → reject, `requires_user` → escalate, `requires_retry` → retry, else revise) → `acceptAt` → `rejectBelow` (retry: regenerate rather than edit) → route by remediations (none → escalate; all retry → retry; else revise).

**The loop** revises or retries with the selected remediations, hydrated with the lenses' own words by the runner (the policy never sees prose), keeps the best iteration by a strict-better gate, and stops with `accepted | rejected | escalated | plateau | max-iterations | producer-unavailable`.

## Guarantees, and where they are pinned

| Guarantee                                                                                                | Pinned by                                            |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A pipeline is data and a malformed one never runs                                                        | `[QL-1]` policy/pipeline/definition specs            |
| Criteria are derived from the goal; the goal reaches only prompts                                        | `[QL-2]` + `tooling/quality-loop-guarantees.spec.ts` |
| Validators run before any model; a block skips every lens                                                | `[QL-3]`                                             |
| Lens output is enum-locked and re-admitted                                                               | `[QL-4]`                                             |
| Agreement, conservative medians, no double charge                                                        | `[QL-5]`                                             |
| Every number comes from the policy; the trace reproduces it                                              | `[QL-6]`                                             |
| The advisory verdict and all prose are structurally unreadable by the policy                             | `[QL-7]` + the meta-gate                             |
| Gates are ordered and deterministic; a blocker never accepts                                             | `[QL-8]`                                             |
| The loop revises against reasons, never a score; stops with a reason; escalates honestly without a model | `[QL-9]`                                             |
| Every run writes an attributed dump, failures included; the HTTP surface validates with zod              | `[QL-10]`                                            |
| The prompt library is served from markdown files and the web client's origin is allowed                  | `[QL-11]`                                            |
| The run on the wire is the shared contract, exchanges summarised, each iteration carrying its artifact   | `[QL-12]`                                            |
| The client lists the library and pipelines and starts a run from the chosen prompt                       | `[QLU-1]`                                            |
| A run is followed by its own status; progress shows the attributed exchanges                             | `[QLU-2]`                                            |
| Results render every part of the verdict from the wire contract alone                                    | `[QLU-3]`                                            |
| Runs persist in normalized tables, reassemble exactly, survive a restart, list newest first              | `[QL-13]`                                            |
| The client lists recent runs, reopens one on click or from `?run=<id>`, refreshes when a run ends        | `[QLU-4]`                                            |
| A composed goal round-trips through its pipeline's codec; exact checks are validators that block         | `[QL-14]`                                            |
| Experience is digested from engine facts, never from an effect a model authored                          | `[QL-15]`                                            |
| A memory run composes recall, target, digest and store through the runs service; every step has a reason | `[QL-16]`                                            |
| Memory lives in a dedicated vector store bound to one model; chunks replace per run; the cache is hashed | `[QL-17]`                                            |
| Embeddings are a port chosen from the environment over an injectable, batching, retrying transport       | `[QL-18]`                                            |

Deliberate deviations from the doctrine's literal shapes: severities are the repo's (`critical` is the doctrine's `fatal`); fixability has four values (no tools or backtracking exist); `suggestedFixType`, report-level confidence and `qualityEvidence` are omitted; constraints are criteria of a gated kind and failure modes are finding types the policy gates.

## The web client (`packages/quality-loop-ui`)

One screen on :4201 (`pnpm quality:start` serves both): pick a prompt from the library and a pipeline from `GET /pipelines`, choose the iterations (default 1 — a live iteration is minutes), run. While the loop runs the page follows `GET /runs/:id` by the run's own status and lists each model exchange as it is attributed; when it ends it shows, per iteration, the decision with its gates and reason, the overall and per-dimension scores, the criteria joined to the contract, the confirmed findings grouped by severity with the remediation notes the policy selected, how the policy decided step by step, and the rendered artifact with its `[component.N]` ids. The prompt and the artifact display as text — no markdown renderer, so the ids a finding points at stay visible.

A "Recent runs" panel lists what the service has persisted, newest first; clicking one reopens it, and the run being shown lands in the URL as `?run=<id>`, so a reload or a bookmark brings it back for analysis.

The client renders the wire contract and nothing else; it shares the request core and polling hook with the studio through `@sysdesign/web-kit` and the spec harness through `@sysdesign/web-testing`.

Not built yet, by choice: response memoisation, per-iteration streaming to the client while the loop is running (the trace lands when it ends), Docker/Tilt/CI images for the service and the client (and a Tilt manifest for the vector store), storing findings and sections as memory chunks (an ingester over the same store), a web-client control for memory runs, a human review queue.
