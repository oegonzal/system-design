# The critic / eval pipeline: how it actually works

A reference for the machinery that turns a submitted diagram into a grade.
`plan.md` beside this file records how the pipeline came to be shaped this way;
this one describes what is there now and where to find it.

Two properties govern every decision below, and most of the design exists to
make them structural rather than conventional:

1. **The LLM never authors a number, and its free-form findings are dropped.**
   It comments, it scores an advisory axis, it proposes — and a rogue `findings`
   or `coverage` artifact from an LLM pass is thrown away (`[EVAL-6]`). The one
   way an LLM lens moves the grade is by emitting **grounded ordinal evidence**
   (a weakness magnitude + confidence, tied to a prompt requirement and the
   affected nodes); a generic, engine-owned scorer turns that into a bounded,
   weakness-only subtraction — it can only lower an already-assessed dimension,
   never past a letter cap, and only when the eval LLM is live (`[EVAL-16]`).
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
| Artifact union            | `engine/core/artifacts.ts`           | `findings` · `coverage` · `axis` · `scenarios` · `graded-evidence` · `diagnostics`    |
| Aggregator                | `engine/core/aggregator.ts`          | `explainAggregate` computes the score and the ledger together                         |
| Profile type + validation | `engine/core/profile.ts`             | `validateProfile` fails fast on a malformed rubric                                    |
| Active profile            | `engine/profiles/default.profile.ts` | `default@3.3.0` — weights, bands, caps, penalties, suppressions                       |
| Engine version            | `engine/scoring.ts`                  | `ENGINE_VERSION = '2.6.0'`                                                            |
| Pure sync façade          | `engine/engine.ts`                   | `runEngine(graph, facts, narrative?, brief?)` — deterministic passes only             |
| Graph traversal           | `engine/graph-index.ts`              | Memoised adjacency and reachability                                                   |
| Stated targets            | `engine/targets.ts`                  | Reads the prompt's own `targetSpec` — the strictest number wins                       |

### The seven passes

Registered in `engine/passes/index.ts`, ordered by the profile.

| Pass id              | Mode          | File                                         | Produces                                                     |
| -------------------- | ------------- | -------------------------------------------- | ------------------------------------------------------------ |
| `rules.core`         | deterministic | `engine/passes/rules/` + `engine/rules/*.ts` | 92 rules → `findings`                                        |
| `expectations.banks` | deterministic | `engine/passes/expectations/`                | 78 expectations → `coverage` + `findings`                    |
| `llm.critic`         | llm           | `engine/passes/critic/` + `src/critic/`      | `graded-evidence` (lens `critic`) + summary                  |
| `llm.depth`          | llm           | `engine/passes/depth/`                       | `axis` + `graded-evidence` (lens `evaluator.depth`)          |
| `llm.narrative`      | llm           | `engine/passes/narrative/`                   | `axis` + `graded-evidence` (lens `critic.narrative`)         |
| `llm.workability`    | llm           | `engine/passes/workability/`                 | `axis` + `graded-evidence` (lens `evaluator.workability`)    |
| `llm.scenarios`      | llm           | `engine/passes/scenarios/`                   | `scenarios` + `graded-evidence` (lens `evaluator.scenarios`) |

Every LLM lens grounds each weakness to a prompt requirement — the NFRs and,
on a workflow prompt, the workflow items — via a per-request `z.enum(ids)` (the
same idiom the binding suggester uses), re-checked admissible before emission;
one shared declaration, `gradedWeaknessShape` + `toGradedItem` in
`engine/passes/graded-grounding.ts`, keeps the currency identical across lenses
(`[EVAL-17]`). A lens either names the dimension itself (critic, depth) or has a
fixed one (narrative → explanation, scenarios → reliability, workability by
factor map); the engine maps a scenario verdict to its magnitude. There is no
free-form LLM findings path any more.
They run live only under the opt-in deep eval (`EVAL_DETERMINISTIC=0`, see the
RUNBOOK); on the default deterministic stack they emit nothing and the score is
byte-identical.

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
   `info` is priced at zero on purpose and is reserved for genuine footnotes —
   today only `explanation.unclaimed-mechanism`, which nudges toward a fuller
   brief rather than reporting a fault. Anything that describes a real problem
   carries `low` or above, because a fault priced at zero is not graded at all.
5. **Null out the unexamined.** A dimension with zero applicable expectations
   _and_ zero violations scores `null`, renders as "Not assessed", and drops out
   of the overall — so an unexamined dimension is never a free 100.
6. **Weight and renormalise** over the assessed dimensions only.
7. **Band, then cap.** Bands `A 92 · B 82 · C 68 · D 50`; below D is F. One
   critical finding caps the letter at C, two at D, regardless of the number.

Weights (`default@3.3.0`, sum to 1, enforced by `validateProfile`). Since 3.3.0
`explanation` carries 0.17 — second only to scalability — so the brief and
narrative are worth nearly a fifth of the grade:

| dimension   | weight |     | dimension | weight |
| ----------- | ------ | --- | --------- | ------ |
| scalability | 0.1825 |     | product   | 0.10   |
| explanation | 0.17   |     | messaging | 0.071  |
| reliability | 0.142  |     | security  | 0.071  |
| performance | 0.1115 |     | hygiene   | 0.0405 |
| data        | 0.1115 |     |           |        |

`product` applies only to prompts carrying a workflow spec; otherwise it scores
`null` and the surviving weights renormalize over their own sum.

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
| naive three-box             | 16.9    | F     |
| naive plus accepted replica | 21.3    | F     |
| solid reference design      | 70.1    | C     |
| excellent design            | 80.5    | C     |

The excellent design stops at 80.5 for reasons worth knowing. It submits no
brief or narrative, so `explanation` scores 0 rather than `null` — silence is
graded, or writing nothing would beat writing badly — and with explanation now
weighted 0.17 that omission costs far more than it used to (`exp.nar.present`
also caps the letter at C). Its monitoring block alerting on nothing costs the
rest.

---

## 4. The two invariants, and what enforces them

### The LLM never authors a number; graded evidence moves the score only through the engine

The guarantee is not "the LLM is inert" — it is "the LLM cannot pick a number,
and cannot smuggle a finished finding into the ledger." What it CAN do is hand
the engine grounded ordinals; the engine does the arithmetic.

- **`enforceMode`** (`engine/core/orchestrator.ts`) filters `findings` and
  `coverage` out of anything declared `mode: 'llm'`, replacing them with an
  `llm-artifact-rejected` diagnostic. A misbehaving pass is audited, not obeyed.
  `graded-evidence` is neither of those kinds, so it passes through — carrying
  ordinals (level + confidence + a requirement id + node ids), never a number.
- **The generic scorer owns the math.** `scoreCoverage` (`aggregator.ts`) turns
  graded evidence into a per-dimension subtraction: each weakness is worth at
  most `maxPointsPerItem` scaled by `w(level) × w(confidence)`, charged
  worst-first with decay, clamped to `maxPenaltyPerDimension` — weakness-only
  (it only lowers), and only for a dimension the deterministic layer already
  assessed. `applyGradeCaps` never sees it, so a lens can dent the number but
  never trip a letter cap. Zero graded items → zero contribution, which is why
  the deterministic stack and every calibration pin are untouched.
- **The aggregator routes the rest by kind.** `axis`, `scenarios` and
  `diagnostics` never reach `scoreCoverage` or `applyGradeCaps`.
- **Suggestions live outside the engine entirely.** Binding proposals are an API
  endpoint, produce no artifact, and reach a graded brief only when a human
  accepts one.

Claimed by `orchestrator.spec.ts` (`[EVAL-16]`: graded evidence survives
`enforceMode` and scores; a rogue `findings` pass is still dropped),
`aggregator.spec.ts` (the bounded weakness-only scorer, decay, clamp, trace, and
empty → no contribution) and `studio-ui/.../llm-insights.spec.tsx`.

_Known wrinkle:_ `eval-runner.service.ts` persists the critic's graded summary
(`criticGraded?.summary ?? …`) as the stored `evaluation.summary`, so the
sentence beside the numbers is the model's prose when the critic ran. The numbers
are the engine's.

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
- `contracts/lib/node-config-fields.ts` — `NODE_CONFIG_FIELDS`, the config-knob
  vocabulary as data (`satisfies`-gated over every node kind): the properties
  panel renders from it, the interface suggester enum-locks to it, and
  `validateGraphReferences` refuses a key or value outside it (a stranger knob
  is a hand-crafted payload; `canonicalizeGraphConfig` is the quiet-discard path
  for a model proposal or a design saved before a knob was retired) `[UX-13]`.
- `tooling/config-knobs.spec.ts` — the drift gate. Every knob in that table must
  be read by the scoring path or reserved with a stated reason, so a dial that
  cannot change an answer cannot ship unnoticed.
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

## 8. What the score is allowed to mean

`QUALITY_AREAS` (`contracts/src/lib/quality-areas.ts`) declares the map and its
edge: the eight areas a dimension grades, and the seven the rubric does not
model at all — cost, migration and rollout, data modelling, operability, team
shape, threat modelling, measured evidence.

This matters because a score out of 100 invites a reading it has not earned.
100 means nothing the engine checks is missing, not that the design is good, and
those are different claims. The summary and the score panel both name the
boundary rather than leaving it implied.

Some quantities the author can now state, which the engine used to assume on
their behalf: the p99 target a rule derives its hop budget from, the shard key a
partitioned store splits on, and `rpsPerInstance` — so capacity arithmetic is
checked against the author's number rather than a hardcoded 3000. An edge can
also declare `intent`, which is what stops an honestly-drawn read path being
counted as a second writer.

---

## 9. Changing it safely

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
