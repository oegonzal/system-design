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
pnpm quality-loop:run --pipeline system-design --goal packages/quality-loop/samples/order-history.prompt.md
# judge a supplied artifact instead of producing one
pnpm quality-loop:run --pipeline system-design --goal prompt.md --output answer.json --iterations 1

# the HTTP surface on :3003
pnpm quality-loop:serve
curl -s localhost:3003/pipelines
curl -s -X POST localhost:3003/runs -H 'content-type: application/json' \
  -d '{"pipeline":"system-design","goal":"# Prompt …"}'     # 202 { runId }
curl -s localhost:3003/runs/<runId>                          # poll until status is complete
```

| Variable                     | Effect                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `QUALITY_LOOP_DETERMINISTIC` | `1` forces the no-op model. Falls back to `EVAL_DETERMINISTIC`; `0` overrides it for this loop. |
| `ANTHROPIC_API_KEY`          | The API route (with `LLM_MODEL`). Wins over the subscription route.                             |
| `QUALITY_LOOP_AUTH`          | `claude-code` runs the loop through this machine's Claude Code login via the Agent SDK.         |
| `QUALITY_LOOP_PORT`          | HTTP port, default 3003.                                                                        |
| `EVAL_DUMP_DIR`              | Where dumps go; default `./static/runs`.                                                        |

Without a live model the loop is honest rather than empty: no criteria are derived, the producer cannot produce, the lenses are skipped, and the controller escalates with `llm-disabled` diagnostics and no invented number. The dump is still written.

## The dump

`static/runs/<runId>-quality/`: `manifest.json`, `run.md` (the human entry point), `01-goal.md` (verbatim), `02-contract.json` (the derived criteria), `03-pipeline.json` (the definition as data), `04-iterations/NN/{iteration,artifact,validation,critics,evaluators,ledger,decision,remediations}.json`, `05-llm/NN.<stage>.<ordinal>.{system.txt,user.txt,response.json,meta.json}` (every exchange, attributed by lens and sample, prompts as text so `grep -r` works), `06-lessons.json`. One row per run in `index.jsonl` with `kind: 'quality'`.

## Declaring a pipeline

A folder beside `src/pipelines/system-design/` and one line in `src/pipelines/index.ts`. The core never changes.

- `definition.ts` — the data: `criterionKinds` and `findingTypes` (id → one-line meaning shown to the model), `maxCriteria`, the producer and criteria-deriver personas, the lens specs (`id`, `persona`, `samples`, `maxItems`, `maxTokens`; evaluators add the `criterionKinds` they judge), and the `policy`.
- `lenses/*.md` — one markdown persona per lens, imported with `?raw`. The engine's `prompting.ts` adds the rules every lens obeys (cite only listed ids, answer in the schema, be complete and concise); the md says what the lens knows.
- `output.ts` — the only code: a zod `schema` for the artifact, `locate(output)` giving positional ids (`component.2`), and `render(output)` printing every id verbatim where a judge reads it.

`validatePipeline` runs at boot and at every run: weights sum to 1, every kind and type is priced onto a known dimension, thresholds and decay are in range, every lens can reach `minHits`, every kind has exactly one evaluator, no reserved or duplicate ids, and the output schema converts to JSON Schema.

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

Deliberate deviations from the doctrine's literal shapes: severities are the repo's (`critical` is the doctrine's `fatal`); fixability has four values (no tools or backtracking exist); `suggestedFixType`, report-level confidence and `qualityEvidence` are omitted; constraints are criteria of a gated kind and failure modes are finding types the policy gates.

Not built yet, by choice: response memoisation, persistence beyond the dump, Docker/Tilt/CI images for the service, a human review queue.
