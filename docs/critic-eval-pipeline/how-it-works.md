# The critic / eval pipeline: how it actually works

A reference for the machinery that turns a submitted diagram into a grade.
`plan.md` beside this file records how the pipeline came to be shaped this way;
this one describes what is there now and where to find it.

Two properties govern every decision below, and most of the design exists to
make them structural rather than conventional:

1. **The LLM cannot move the score.** It comments, it scores an advisory axis,
   it proposes; it never grades. This is `[EVAL-6]`.
2. **A grading predicate reads facts, never prose.** Evidence is a node kind, a
   config knob, a graph path, or an id the author bound — never a substring.
   Anything that reads text can be defeated by rewording it and satisfied by a
   pasted keyword list.

---

## 1. The path a submission takes

```
studio-ui                studio-api                       Postgres            eval-worker
   │                        │                                 │                     │
   ├─ POST /sessions/:id/revisions ─────────────────────────► │                     │
   │                        ├─ DTO validation (400)           │                     │
   │                        ├─ referential validation (422)   │                     │
   │                        └─ one transaction: ──────────────┤                     │
   │                             design_revision              │                     │
   │                             evaluation  (queued)         │                     │
   │                             eval_job    (queued) ────────┤                     │
   │                                                          │  claim (SKIP LOCKED)│
   │                                                          │ ◄───────────────────┤
   │                                                          │        runEvaluation│
   │  GET /revisions/:id/evaluation (polled) ◄────────────────┤ ◄───────────────────┤
```

| Step                                   | Lives in                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Submit endpoint                        | `packages/studio-api/src/modules/sessions/sessions.controller.ts`          |
| Transaction, 404/422 decisions         | `.../sessions/sessions.service.ts` → `submitRevision`                      |
| Graph referential checks               | `.../sessions/graph-validator.ts` → `validateGraphReferences`              |
| Brief referential checks               | `.../sessions/brief-validator.ts` → `validateBriefReferences`              |
| Job enqueue (the BullMQ swap seam)     | `.../sessions/eval-queue.ts`                                               |
| Entities                               | `packages/db/src/entities/{design-revision,evaluation,eval-job}.entity.ts` |
| Claim loop, stale-lock reaper, backoff | `packages/eval-worker/src/modules/poller/poller.service.ts`                |
| One job: engine → persist              | `.../poller/eval-runner.service.ts`                                        |

**Shape errors are 400, referential errors are 422.** A DTO decides whether the
payload has the right shape; the validators decide whether its references
resolve against _this_ graph and _this_ prompt. Both collect every problem and
answer once, so a caller never round-trips to find the second mistake.

The line the validators hold, stated in `brief-validator.ts` and worth
repeating: **impossible claims are rejected, unsupported claims are graded.**
"You bound `failover` to a database with no replica" is a grade, not a save
blocker — if the API refused it, the API would be doing the teaching and the
author would never see the finding that explains why.

---

## 2. The engine

`packages/eval-worker/src/engine/`. Pure: no clock, no randomness, no I/O.
Identical inputs give a byte-identical result.

```
runEvaluation(graph, facts, narrative, brief, llm, profile, registry)
   │
   ├─ for each enabled pass, in profile order ──► EvidenceArtifact[]
   │      └─ enforceMode() drops findings/coverage from any `mode: 'llm'` pass
   │
   └─ aggregate(artifacts, profile) ──► scores, grade, summary, trace
```

| Piece                     | File                                 | What it does                                                                          |
| ------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| Orchestrator              | `engine/core/orchestrator.ts`        | Runs passes serially, enforces the mode contract, brackets each pass for the run dump |
| Artifact union            | `engine/core/artifacts.ts`           | `findings` · `coverage` · `axis` · `scenarios` · `annotations` · `diagnostics`        |
| Aggregator                | `engine/core/aggregator.ts`          | `explainAggregate` computes the score and the ledger together                         |
| Profile type + validation | `engine/core/profile.ts`             | `validateProfile` fails fast on a malformed rubric                                    |
| Active profile            | `engine/profiles/default.profile.ts` | `default@3.0.0` — weights, bands, caps, penalties, suppressions                       |
| Engine version            | `engine/scoring.ts`                  | `ENGINE_VERSION = '2.3.0'`                                                            |
| Pure sync façade          | `engine/engine.ts`                   | `runEngine(graph, facts, narrative?, brief?)` — deterministic passes only             |
| Graph traversal           | `engine/graph-index.ts`              | Memoised adjacency and reachability                                                   |

### The six passes

Registered in `engine/passes/index.ts`, ordered by the profile.

| Pass id              | Mode          | File                                         | Produces                                  |
| -------------------- | ------------- | -------------------------------------------- | ----------------------------------------- |
| `rules.core`         | deterministic | `engine/passes/rules/` + `engine/rules/*.ts` | 86 rules → `findings`                     |
| `expectations.banks` | deterministic | `engine/passes/expectations/`                | 78 expectations → `coverage` + `findings` |
| `llm.critic`         | llm           | `engine/passes/critic/` + `src/critic/`      | `annotations`                             |
| `llm.depth`          | llm           | `engine/passes/depth/`                       | `axis` (advisory score)                   |
| `llm.narrative`      | llm           | `engine/passes/narrative/`                   | `axis` + `annotations`                    |
| `llm.scenarios`      | llm           | `engine/passes/scenarios/`                   | `scenarios`                               |

**Rules subtract, expectations earn.** A rule fires when something is wrong. An
expectation states something a design of this archetype and difficulty ought to
do, and is met or unmet. Rule files: `brief`, `dag`, `data`, `hygiene`,
`interfaces`, `messaging`, `performance`, `reliability`, `scalability`,
`security` (+ `shared.ts` for the predicates they share). Expectation banks:
`core`, `shared`, `brief`, plus one per archetype — `flash-sale`, `dag`,
`workflow`, `media-streaming`, `realtime-analytics`.

Every LLM pass returns a `diagnostics` artifact rather than throwing, with a
reason: `llm-disabled` (no model), `llm-failed` (refusal, schema miss, or API
error — the port collapses all three to `null`), `not-applicable`,
`token-clipped`, `llm-artifact-rejected`.

---

## 3. How a score is computed

`engine/core/aggregator.ts`. The whole model, in order:

1. **Collect** artifacts into buckets. Only `findings` and `coverage` go
   further; the rest ride along to be displayed.
2. **Suppress.** One lesson, one finding: a rule finding is dropped when the
   profile pairs it with an expectation the design already leaves unmet, so the
   author is not charged twice for the same gap. 28 pairs today.
3. **Earn a base**, per dimension: `100 × met weight ÷ total weight` over the
   expectations that _apply_ to this prompt.
4. **Subtract penalties**, worst first, with geometric decay:
   `penalty = Σ price[severity] × 0.7^position`.
   Prices: `critical 35 · high 22 · medium 10 · low 4 · info 0`.
   Stacking hurts without nuking a dimension the way a hard floor did.
5. **Null out the unexamined.** A dimension with zero applicable expectations
   _and_ zero violations scores `null`, renders as "Not assessed", and drops out
   of the overall — so an unexamined dimension is never a free 100.
6. **Weight and renormalise** over the assessed dimensions only.
7. **Band, then cap.** Bands `A 92 · B 82 · C 68 · D 50`; below D is F. One
   critical finding caps the letter at C, two at D, regardless of the number.

Weights (sum to 1, enforced by `validateProfile`):

| dimension   | weight |     | dimension   | weight |
| ----------- | ------ | --- | ----------- | ------ |
| scalability | 0.225  |     | messaging   | 0.09   |
| reliability | 0.18   |     | security    | 0.09   |
| performance | 0.135  |     | hygiene     | 0.045  |
| data        | 0.135  |     | explanation | 0.10   |

### The trace

`explainAggregate` returns the numbers **and** the ledger behind them, and
`aggregate` reads that ledger rather than recomputing — so the trace cannot
disagree with the score. It records what was otherwise unrecoverable: each
dimension's met/total and base, every penalty at the decay position it was
charged at (the returned `findings` are re-sorted without a severity term, so
position cannot be read off the result), which suppressions fired, and every
grade cap evaluated including the ones that did not bind.

### Calibration is pinned

`engine/calibration.spec.ts` fixes five designs to exact scores. Changing the
rubric moves these; moving them is allowed, silently moving them is not.

| design                      | overall | grade |
| --------------------------- | ------- | ----- |
| empty canvas                | 0       | F     |
| naive three-box             | 18      | F     |
| naive plus accepted replica | 23      | F     |
| solid reference design      | 77.9    | C     |
| excellent design            | 90      | B     |

The excellent design stops at 90 because it submits no brief: `explanation`
scores 0, not `null`. Silence is graded — otherwise writing nothing would beat
writing badly, which was a live perverse incentive until it was fixed.

---

## 4. The two invariants, and what enforces them

### The LLM cannot move the score

Three independent mechanisms, none of which relies on a pass behaving:

- **`enforceMode`** (`engine/core/orchestrator.ts`) filters `findings` and
  `coverage` out of anything declared `mode: 'llm'`, replacing them with an
  `llm-artifact-rejected` diagnostic. A misbehaving pass is audited, not obeyed.
- **The aggregator routes by kind.** `axis`, `scenarios`, `annotations` and
  `diagnostics` never reach `scoreCoverage` or `applyGradeCaps`.
- **Suggestions live outside the engine entirely.** Binding proposals are an API
  endpoint, produce no artifact, and reach a graded brief only when a human
  accepts one.

Claimed by `orchestrator.spec.ts`, `aggregator.spec.ts` and
`studio-ui/.../llm-insights.spec.tsx`.

_Known wrinkle:_ `eval-runner.service.ts` persists `critique?.summary ?? result.summary`,
so the stored `evaluation.summary` is the model's prose when the critic ran. The
numbers are untouched; the sentence beside them is not.

### Grading reads facts, not prose

- `packages/contracts/src/lib/mechanisms.ts` — the closed vocabulary of 18
  claims, what proves each (`MECHANISM_EVIDENCE`, a **total** `Record`, so a
  claim that cannot be verified cannot be claimed), what disproves some
  (`MECHANISM_DISPROOF`, deliberately `Partial` — absent ≠ denied), and which
  node kinds may carry each (`MECHANISM_KINDS`).
- `tooling/grounded-scoring.spec.ts` — the gate. No file under `engine/rules` or
  `engine/passes/expectations` may read `functionalText`, the narrative, or a
  binding `note`. Applicability branches on the typed `functionalCapabilities`
  vocabulary instead.
- The walkthrough is **not scored**. It is persisted, displayed, and read by the
  critic; `narrative-editor.tsx` says so in the UI, because an editor that
  implies a box is graded when it is not is its own kind of dishonesty.

---

## 5. The design brief

The graded half of explaining a design: which components hold which requirement,
and how a request travels. Every field is a _reference_ — an NFR id, node ids, a
mechanism from the closed vocabulary, an ordinal into the functional
requirements, ordered edge ids — so the grade survives renaming a box and fails
on claiming something the canvas does not do.

| Piece                                  | File                                           |
| -------------------------------------- | ---------------------------------------------- |
| Types + limits                         | `contracts/src/lib/design-brief.ts`            |
| Vocabulary, evidence, `judgeMechanism` | `contracts/src/lib/mechanisms.ts`              |
| Engine adapter over `GraphIndex`       | `engine/mechanisms.ts`                         |
| Expectations (`exp.brf.*`)             | `engine/passes/expectations/banks/brief.ts`    |
| Rules (`explanation.*`)                | `engine/rules/brief.ts`                        |
| Editor                                 | `studio-ui/src/features/practice/brief/`       |
| Draft rules, payload reconciliation    | `studio-ui/src/features/canvas/brief-draft.ts` |

`judgeMechanism` returns four sets: `corroborated` (claimed ∩ evidence),
`contradicted` (claimed ∩ disproof), `uncorroborated` (neither), and `unclaimed`
(evidence the author took no credit for). **The editor and the engine run the
same function over the same graph**, so the chip an author sees while writing is
the verdict that will grade them — there is nothing to keep in sync.

The editor makes rejectable shapes unrepresentable rather than validating them:
the node picker offers only kinds `MECHANISM_KINDS` admits, the flow builder
offers only edges that continue the walk, and `reconcileBrief` is the single
point where a draft becomes a payload.

---

## 6. Where the LLM is used

Three call sites, one seam (`packages/llm/`), one contract: **one structured
call, `null` on any failure.** Every caller must already hold a deterministic
answer, so "unavailable / refused / returned junk" is never an error path.

| Job                                   | Where                                                     | If there is no model                                               |
| ------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Prompt enrichment (prose polish only) | `studio-api/.../generator/enrich-prompt.ts`               | The generated prompt stands, `llmEnriched: false`                  |
| Critic, depth, narrative, scenarios   | `eval-worker/src/engine/passes/*`                         | A `llm-disabled` diagnostic; the deterministic grade is unaffected |
| Binding suggestions                   | `studio-api/.../sessions/suggestions/suggest-bindings.ts` | An empty list — the same response shape                            |

`createLlmClientFromEnv` (`packages/llm/src/create-client.ts`) is the only place
env vars are read. `EVAL_DETERMINISTIC=1` outranks a present key, which is why
CI, the e2e suite and every vitest run grade identically on a machine that has
one.

Two layers guard model output everywhere: **enum-lock what you can** (`z.enum`
over contract tuples, and per-request enums of the real ids — the model cannot
name a node that is not on the canvas), then **filter what you cannot** against
the real graph after parsing.

One deliberate omission worth knowing about: the suggester is given mechanism
_labels_ but never `MECHANISM_GUIDE[claim].proof`. Those strings say what the
engine looks for, and a model that knew them could propose only bindings
guaranteed to corroborate — the explanation dimension would stop measuring the
author. `suggest-bindings.spec.ts` pins their absence from the prompt.

---

## 7. When something looks wrong: run dumps

Every prompt generation, evaluation and suggestion writes a self-describing
folder to `static/runs/{ISO-stamp}-{hex}-{kind}/` — gitignored, always on, never
pruned. Names sort chronologically; `index.jsonl` is one flat row per run.

```
static/runs/2026-09-01T07-20-05-880-9f3c2a-eval/
  run.md              what happened, in one screen
  manifest.json       ids, versions, timings, git, llm status, promptRunId
  01-prompt.json      02-submission.json   03-facts.json   04-profile.json
  05-passes.json      per pass: mode, options, ms, artifacts, rejected payload
  06-llm/…            every system + user prompt as .txt, response, usage, stop_reason
  07-artifacts.json   08-scoring.json (the trace)   09-result.json
```

Written on the failure path too, carrying the phase it died in and the inputs
that caused it. Plumbing in `packages/run-dump/`; the records are per app
(`eval-worker/src/dump/`, `studio-api/.../prompts/dump/`,
`studio-api/.../sessions/suggestions/suggestion-dump.ts`) because each is typed
against its own vocabulary.

Under `EVAL_DETERMINISTIC=1` the `06-llm/` folder is legitimately empty — every
LLM pass returns before assembling a prompt — and the manifest says so.

---

## 8. Changing it safely

- **Adding a rule or expectation moves the calibration table.** Re-pin
  `calibration.spec.ts` deliberately and say why in the commit.
- **Changing scoring semantics means a new profile version.** Evaluations record
  the profile they were graded under, so history stays readable; a cross-revision
  trend must segment on `profileVersion`.
- **A new mechanism claim will not compile** until it has an evidence predicate,
  an eligibility list and a guide entry — three `satisfies Record<...>` tables
  enforce totality.
- **Gates that will stop you:** `tooling/grounded-scoring.spec.ts` (no prose in
  scoring), `tooling/criteria-coverage.spec.ts` (every criterion has a test —
  note it is a substring scan, so a `test.fixme` title satisfies it),
  `tooling/code-review/rules/boundaries.ts` (studio-api and eval-worker may not
  import each other), `pnpm test:stories` (a11y + console noise).
- **Run the API and worker suites serially** — they share one database and
  truncate it.
- **Rebuild before any e2e or headed run.** `.next` and `dist/main.js` embed the
  old rubric otherwise, and a stale worker will grade with old values.
