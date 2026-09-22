# Orchestrators: the generic layer, three more compositions, and what the runs showed

An orchestrator is data over registered pipelines: which run, in what order,
what each step needs from the ones before it, and the closed reasons its
steps may give. One generic runner executes any of them. The first instance,
`memory`, is the subject of [`./memory-runs.md`](./memory-runs.md); this page
is the layer itself, now that it carries four, and the three that arrived
together: `calibration`, `second-opinion` and `router`. The engine under all
of it — `core/` — gained one pure file, `reconcile.ts`, and no edit.

Two facts organise everything below:

1. **A step's whole job is to turn what came before into a run and read the
   run back.** Every pipeline eats a markdown goal, and every finished run is
   read through one view, `core/outputs.ts`. That is why any pipeline can feed
   any other, and why a pipeline can be a judged subroutine rather than only
   a stage: memory-recall curates, experience-digest extracts, and a judge
   judges an artifact it did not produce.
2. **Disagreement is the signal worth reading.** The two panel orchestrators
   exist to run a pipeline several times and report where the runs did not
   agree. The reconcile that does it reports and never judges: a threshold on
   any of its numbers would be policy, and policy lives on a pipeline.

---

## 1. What a step can be

A declaration is `{ id, needs?, pipeline?, provided?, run }`. Five shapes,
all in use:

| Shape                                      | The declaration                                        | Used by                                              |
| ------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------- |
| Run one fixed pipeline                     | `pipeline: MEMORY_RECALL_ID`                           | memory `recall`, `digest`                            |
| Run the pipeline the request named         | `pipeline: (request) => request.pipeline`              | memory `target`, both panels                         |
| Run a pipeline chosen from what ran before | `pipeline: (_, outputs) => outputs.classify?.pipeline` | router `judge`                                       |
| Run several, each named at the call        | `pipeline: ['a', 'b']` + `execute(input, 'b')`         | a panel over lens variants (§8)                      |
| Run no pipeline, only port work            | no `pipeline`                                          | memory `store`, router `classify`, every `reconcile` |

Plus the stand-in: a step with `provided` lets a run handed in through
`/from-run` stand for it, its output seeded before anything runs.

**Every pipeline a step can ever run is visible in its declaration.** The
runner resolves the declaration once the `needs` are met, skips the step as
`pipeline-unavailable` if any named pipeline is not registered, and hands the
step an `execute` that refuses anything else: with one declared it runs that
one, with several the call must name one of them, and a name outside the
list throws — which the runner records as `errored`. A chooser sees the
request and the outputs of earlier steps, never prose.

**A step keeps every child it opens.** `runIds` on the ledger entry, in the
order they opened, each recorded the moment the child's row exists. A step
that runs a pipeline three times has three ids; the record carries them as
`orchestration_run_child` rows keyed by step and ordinal. Nothing else
changed in the runner: the cascade, the closed reasons, the one serial flush
chain and the boot sweep are what §4 of the memory page says they are.

**A step may report.** Beside `counts` (numbers a client can tone) a step
may leave a `report` — the orchestrator's own shape, declared beside its
context — for what a number cannot say. The reconcile steps use it.

Above the steps, five hooks: `takesTarget` (whether the request names a
pipeline: required by an orchestrator that takes one, refused by one that
chooses its own — enforced by the service, never by each orchestrator),
`reasons` (closed), `normalize` (the request as the record and every step
should see it), `refuse` (what the orchestrator will not run), and `context`
(what it observed at open).

---

## 2. The shared blocks

Three files carry what more than one orchestrator declares. They are
declared, not applied: the runner knows none of them.

**`orchestrators/common.ts`.** `INTERNAL_PIPELINES` — the two that take a
goal another step composed, never a brief; no orchestrator accepts one as a
target and the router never offers one as a route. `refuseInternal`,
`bareRequest` (a stored goal may carry what a memory run appended, and no
step should read that as part of the brief), `runTarget` (run a declared
pipeline as the run's own deliverable: its failure is the orchestration's),
`providedAsOutput` (the stand-in a provided run makes), `briefRoutes` (the
registry minus the internal pipelines, as `{ id, description }`), and
`soleChild`.

**`orchestrators/panel/steps.ts`.** Two adapter factories. `panelStep(source)`
runs each of the step's declared pipelines `samples` times over the input
`source` derives from the context — **one after another, on purpose**: every
sample is a whole run on the subscription client, and one at a time is the
rule there. A failed sample is counted (`sample-failed`, `n of k`), not
fatal, unless none completed. `reconcileStep(runs, alignment)` reads the runs
the definition names through `outputsOf`, skips as `too-few-runs` below two
(one run cannot disagree with itself, and a report saying everything agreed
would be a lie), and otherwise writes the report and its headline counts.

**`core/reconcile.ts`.** Pure of everything but ids, enums and numbers, and
guarded exactly as the normaliser and the controllers are (the tooling spec
that forbids prose, the goal and the advisory verdict in those files now
lists seven). It compares:

- decisions, stop reasons and gates as counts over the runs;
- `overall`, iteration count and every dimension as a spread — `n`, min,
  max, mean, range — where a `null` dimension score is left out and `n` says
  how many assessed it. Range rather than a standard deviation: three
  samples is what a panel usually is, and a range does not pretend otherwise;
- finding **types**: how many runs confirmed at least one of each, and which
  were `unanimous` (every run) or `contested` (some, not all);
- finding **keys**, under `provided` alignment only. A key is type plus
  locations, so it is comparable across runs only when the artifact is the
  same one; then each contested key says which runs saw it (`seenBy`, indexes
  in reconcile order). Under `produced` alignment — every run made its own
  artifact — the key lists are empty by construction.

---

## 3. The three new orchestrators

### `calibration` — run one goal k times, report the spread

```
panel      pipeline: the request's     run each sample with the request's goal, output and budget
reconcile  needs: [panel]              alignment: produced
```

`takesTarget: true`, reasons `sample-failed`, `too-few-runs`. Every sample
is an ordinary run of the named pipeline, producer included, so the spread is
the loop's end-to-end variance — producer and judges together — and what is
comparable is what the policy keys: decisions, dimensions, finding types. A
`/from-run` start calibrates the recorded run's goal with its iteration
budget; nothing stands in, and the record says `outputProvided: false`.

### `second-opinion` — hold one artifact fixed, judge it k more times

```
first      pipeline: the request's     the first opinion; a provided run stands in for it
panel      needs: [first]              the first's artifact, output-provided, one iteration, k times
reconcile  needs: [first, panel]       alignment: provided — the first opinion is run 0
```

`takesTarget: true`, reasons `sample-failed`, `too-few-runs`, `no-artifact`.
The panel hands the first opinion's artifact to the same pipeline with the
producer skipped (`mode: 'provided'`; the schema validator still runs first;
criteria are still derived per run), so what the reconcile compares is
judgement alone, and finding keys line up. The judges read the bare brief:
what a memory run appended for the producer is not part of what the artifact
is judged against. Different lenses are sibling pipelines sharing an output
codec, and the panel accepts a list — a declaration away (§8).

`POST /orchestrations/second-opinion/from-run { runId, samples }` is the
common entry: any recorded run, judged again by fresh panels, with the
recorded verdict as run 0.

### `router` — read the brief, pick the judge, run it

```
classify   no pipeline                 the classifier names one registered route; note = its sentence
judge      needs: [classify]           pipeline: whatever classify produced; judged once by default
```

`takesTarget: false` — the router chooses; a request that names a pipeline
is refused — reasons `classifier-disabled`, `no-routes`, `unclassified`. All
three fail the run: dispatch is the deliverable, and a record that completed
with nothing judged would be a lie.

The routes are never listed. They are every registered pipeline that takes a
brief, read from the registry at run time, so a fifth judge is a route the
day it is registered. The classifier (`modules/router/classifier.ts`, persona
in `classifier.md`) is one structured model call on the query-probes
precedent: not a child run, never a verdict, and **schema-locked to the
registered ids** — the model cannot name a judge that does not exist. It
decides from what an answer to the brief would have to be, matched against
each judge's own description, never from headings or a word in a title — the
same rule the agentic prompts set for their own engines. The judge step's
pipeline is whatever `classify` produced; the runner's declared-pipeline
check, not the classifier, is what dispatches.

One detail worth knowing: with no pipeline named at open, the record's
iteration budget falls to the default of one, so the judge step passes that
default explicitly — a routed run judges once unless the request asks for
more, and record and child agree.

---

## 4. The record and the routes

`OrchestrationRunDto` is one shape for every orchestrator. What this work
changed on it: `steps[*].runIds` (was `runId`), `steps[*].report`, and
`request.samples`. The migration
`Migration20260922100000_orchestration_children_ordinal` rewrote every
existing row in place — one child became ordinal zero, one id a one-element
list — so no reader keeps two shapes, and `orchestration_run_child` is now
unique on `(run_id, step, ordinal)`.

| Verb   | Path                                     | Body                                          | Answers                                       |
| ------ | ---------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| `POST` | `/orchestrations/:orchestrator`          | `runRequest` + `pipeline?` + `samples?` (1–5) | 202 `{ orchestrationRunId, status }`          |
| `POST` | `/orchestrations/:orchestrator/from-run` | `{ runId, samples? }`                         | 202, the same                                 |
| `GET`  | `/orchestrations`, `/orchestrations/:id` | list paging / —                               | the records, steps in declared order          |
| `POST` | `/router/report`                         | `{ goal }`                                    | 200 `{ routes, pipeline, rationale }`, no run |

The edge no longer demands a pipeline; the declaration does. `memory`,
`calibration` and `second-opinion` answer 400 without one and 400 to an
internal one; `router` answers 400 with one. A named pipeline that is not
registered is still 404. `samples` above five is 400: every sample is a
whole run.

`/from-run` builds the request from the recorded run's goal and budget,
adds the pipeline only for an orchestrator that takes a target, and hands the
run in as a stand-in only where some step declares one — otherwise the run is
only the request's origin, and the record says nothing of it.

---

## 5. Operating it

```bash
# the service, as before (QUALITY_LOOP_AUTH is the trap: without it every run degrades silently)
env DB_PORT=5433 QUALITY_LOOP_AUTH=claude-code node --env-file-if-exists=.env packages/quality-loop/dist/main.js

# which judge the router would pick, running nothing — the accuracy tool
curl -s -X POST localhost:3003/router/report -H 'content-type: application/json' -d '{"goal":"# Prompt …"}'

# route a brief: classify, then judge once with the judge chosen
curl -s -X POST localhost:3003/orchestrations/router -H 'content-type: application/json' -d '{"goal":"# Prompt …"}'

# calibrate: the same goal three times through agentic-design, one iteration each, then the spread
curl -s -X POST localhost:3003/orchestrations/calibration -H 'content-type: application/json' \
  -d '{"pipeline":"agentic-design","goal":"# Prompt …","samples":3,"maxIterations":1}'

# a second opinion on any recorded run: three fresh panels over its artifact, the recorded verdict as run 0
curl -s -X POST localhost:3003/orchestrations/second-opinion/from-run -H 'content-type: application/json' \
  -d '{"runId":"2026-09-10T03-44-24-017-ebb942-quality","samples":3}'

curl -s localhost:3003/orchestrations/<id>     # the ledger, live; steps.reconcile.report when it lands
```

Reading a panel record: `steps.panel.runIds` are the samples in the order
they ran, each an ordinary run at `GET /runs/:id`; `steps.reconcile.counts`
is the headline (`runs`, distinct `decisions`, `contestedTypes`,
`contestedFindings`, `overallRange`); `steps.reconcile.report` is the
`PanelReportDto` of §2. On a second opinion, run 0 of the report is the first
opinion, so `seenBy: [0]` on a contested key means only the recorded verdict
saw it, and `[1, 2, 3]` means every fresh panel did and the record did not.

Do not run anything that boots `AppModule` — `main.js replay`, the CLI —
while an orchestration is live: the boot sweep fails every `running` row
(SEAM-4 in the register).

---

## 6. What the runs showed

Every run below was made on 2026-09-22 against the live subscription model,
one after another, on the agentic prompts. The numbers are what the records
say; the reading of them is offered, not built in.

### 6.1 Routing: 25 of 25, four seconds a brief

`POST /router/report` over the whole prompt library — fifteen agentic
briefs, ten system-design briefs — chose the expected judge every time, in
2.8–4.9 s per brief. No miss to explain, which is the result the persona was
written for: it decides from what an answer would have to be, matched
against each judge's own description, and the two descriptions differ in
exactly that. The check is worth keeping as a script rather than a fact: a
sixth prompt archetype, or a third judge, is when it starts to earn its keep.

### 6.2 Calibration 1: `memory-curator`, three samples, one iteration each

Orchestration `ff2ed9c9`, 27 minutes end to end (nine per sample).

| sample | overall | decision | completeness | interfaces | compliance | soundness | `policyAllowed` |
| ------ | ------- | -------- | ------------ | ---------- | ---------- | --------- | --------------- |
| 0      | 76.0    | accept   | 72.2         | 87.5       | 83.3       | 62.5      | true            |
| 1      | 62.5    | revise   | 50.0         | 62.5       | 66.7       | 75.0      | false           |
| 2      | 67.9    | revise   | 55.6         | 75.0       | 66.7       | 75.0      | false           |

The report: `overall` mean 68.8, range **13.5**; `completeness` range 22.2,
`interfaces` range 25, `compliance` 16.6, `soundness` 12.5; decision
contested (one accept, two revise); five finding types unanimous
(`contract_mismatch`, `contradiction`, `sequence_gap`, `unhandled_failure`,
`unsupported_claim`) and three contested (`authority_leak`,
`leaky_generality`, `missing_requirement`). No finding keys, by
construction: every sample produced its own artifact.

**Reading it.** The spread on one brief through one iteration is wide
enough that a single run's overall should not be read to better than about
plus or minus seven points, and a single run's decision should not be read
as the pipeline's decision at all. But the contested decision is not a
matter of taste, and the record says why. `leaky_generality` is a gated type
in `agentic-design`, and only `critic.generality` raises it. In sample 0 that
critic's first sample came back `schema-miss`; its second sample raised
three `leaky_generality` findings, every one of which the normaliser
discarded as `below-min-hits, 1 of 2 samples`. The gated blocker vanished,
`policyAllowed` held, and the artifact was accepted at 76. Samples 1 and 2,
with both critic answers present, confirmed the same type (two findings
each, two hits each) and were held for revise. The one accept in this panel
is the sample-loss weakness the register records as ENG-2 and SEAM-2 — but
in the direction not yet seen: a lost **critic** sample removes a blocker
and lets an artifact through, where a lost **evaluator** sample had only
ever escalated one. Same cause, opposite error. The reconcile did not judge
that; it made it visible.

### 6.3 Calibration 2: `consensus-panel`, three samples, one iteration each

Orchestration `6aec0f63`, 28 minutes.

| sample | overall | decision | completeness | interfaces | compliance | soundness |
| ------ | ------- | -------- | ------------ | ---------- | ---------- | --------- |
| 0      | 62.3    | revise   | 55.6         | 75.0       | 50.0       | 62.5      |
| 1      | 65.6    | revise   | 66.7         | 75.0       | 50.0       | 62.5      |
| 2      | 61.9    | revise   | 66.7         | 62.5       | 50.0       | 62.5      |

The report: `overall` mean 63.3, range **3.7**; `compliance` and `soundness`
identical across all three (range 0); `interfaces` range 12.5,
`completeness` 11.1; decision unanimous (`revise`, `policyAllowed` false in
every sample, `leaky_generality` the blocker every time); five types
unanimous, two contested (`authority_leak` once, `contradiction` twice). No
schema miss in 48 exchanges.

**Reading it, with 6.2 beside it.** With every sample intact the loop
agreed with itself to within four points and on every gate, and the
dimensions that carry the most policy weight did not move at all. The
thirteen-point spread in 6.2 came from one lost sample, not from the judges'
opinions of the artifact. Put together, the two panels say the judges are
consistent when they all answer, and that the one thing that moves a verdict
is a sample that does not arrive. That is the register's SEAM-2 measured
from the other side: a retry on a schema miss is worth more than a third
sample, because the samples that arrive already agree.

### 6.4 Second opinion 1: the recorded 82.8, judged three more times

Orchestration `8fa058ee`, from-run on `2026-09-08T23-27-09-513-776aa9`
(the best post-retemplate `agentic-design` run: 82.8, above the accept bar,
held for revise by a gated `leaky_generality`), three fresh judge-only
panels over its artifact, 19 minutes.

| opinion     | overall | decision | completeness | interfaces | compliance | soundness | criteria           | findings reconciled |
| ----------- | ------- | -------- | ------------ | ---------- | ---------- | --------- | ------------------ | ------------------- |
| 0, recorded | 82.8    | revise   | 100          | 83.3       | 100        | 51.4      | 20 pass            | 0 of 7              |
| 1, fresh    | 70.6    | revise   | 66.7         | 75.0       | 83.3       | 62.5      | 10 pass 10 partial | 8 of 8              |
| 2, fresh    | 74.8    | revise   | 72.2         | 75.0       | 100        | 62.5      | 10 pass 10 partial | 8 of 8              |
| 3, fresh    | 70.6    | revise   | 66.7         | 75.0       | 83.3       | 62.5      | 10 pass 10 partial | 8 of 8              |

The report: decision unanimous (`revise`, `leaky_generality` the blocker in
all four); `overall` range 12.2 over the four, **4.2 over the three fresh
panels**; four finding types unanimous, three contested (`missing_requirement`,
`sequence_gap`, `unhandled_failure`, each seen by one or two panels); finding
keys: **none unanimous, 26 contested**, one key shared by two panels
(`unhandled_failure|flow.4,policy.4,risk.5,role.3`, seen by panels 2 and 3),
every other key seen by exactly one.

**Reading it.** Two findings, both explained by the record rather than by
the judges.

The recorded verdict is not one the current loop would give, and the reason
is dated to the hour. The run was judged at 16:27 on 2026-09-08; the change
that lets evaluators consume confirmed findings (`60c7e8e`, memory-runs
§12.5) landed at 17:06. Its evaluators never saw the seven defects the
critics confirmed: 20 criteria passed, none of the findings reconciled to a
criterion, completeness and compliance at 100. Every fresh panel saw eight
confirmed defects, marked ten criteria partial, reconciled all eight, and
landed within 4.2 points of one another. A second opinion on a recorded run
is therefore also a check of _which judges_ recorded it — and the report
says so in `seenBy`, the dimension spreads, and the reconciled counts,
without anyone having to remember the date.

The finding keys did not line up even though the artifact did, and the
cause is ENG-3: a confirmed finding on this pipeline carries 8 to 33
location refs because the normaliser chains defects through any shared
ref, so two panels that plainly found the same `contract_mismatch` (all
four did) named it with location sets that differ by a ref or two and got
different keys. Under `provided` alignment the types are comparable and the
keys are, in principle; in practice on `agentic-design` the keys are unique
per run until grouping is anchored. The one shared key is the one small
enough to survive. So this report reads at the type level today; the
key-level half of it is what anchor-based grouping would switch on, and the
reconcile is already written for that day.

### 6.5 Second opinion 2: the recorded 67.5, judged three more times

Orchestration `be280e63`, from-run on `2026-09-10T03-44-24-017-ebb942`
(the most recent `agentic-design` run before this work, the
`workflow-composer` brief, 67.5, revise), three fresh panels, 17 minutes.

| opinion     | overall | decision | completeness | interfaces | compliance | soundness |
| ----------- | ------- | -------- | ------------ | ---------- | ---------- | --------- |
| 0, recorded | 67.5    | revise   | 66.7         | 75.0       | 83.3       | 50.0      |
| 1, fresh    | 67.5    | revise   | 66.7         | 75.0       | 83.3       | 50.0      |
| 2, fresh    | 66.9    | revise   | 66.7         | 62.5       | 83.3       | 62.5      |
| 3, fresh    | 66.9    | revise   | 66.7         | 62.5       | 83.3       | 62.5      |

The report: `overall` range **0.6** over all four; `completeness` and
`compliance` identical in every opinion; `interfaces` and `soundness` each
range 12.5, and in opposite directions in the same two panels, which is why
the overall barely moves; decision unanimous. One finding type unanimous
(`contract_mismatch`), six contested, no key shared by any two opinions.

**Reading it, with 6.4 beside it.** This record was judged on 2026-09-10,
by the loop as it is now, and three fresh panels reproduced its verdict to
within a point — the first one exactly, dimension for dimension. Where 6.4
showed a recorded verdict the current judges would not give, 6.5 shows one
they give again and again. The pair is the second-opinion orchestrator's
case in one sentence: it tells a recorded verdict from a reproducible one,
and the record itself says which is which.

Two smaller things. The types flicker — six of seven contested — while the
score holds still, because on this artifact the penalty a type carries is
small next to what the criteria decide, and criteria agreed everywhere. And
the finding keys again share nothing between panels, for the reason 6.4
gives.

### 6.6 One routed run: `tool-contract-broker`, no pipeline named

Orchestration `5dbbeb97`, 11 minutes. `classify` completed in seconds with
`routes: 2` and the sentence it gave — "the brief asks for a capability
broker governing how agents, tools and declarations fit together" — on the
step's `note`; `judge` ran `agentic-design` once, as the record's
`maxIterations: 1` says it would, and held the answer for revise at 62.5.
The record's `pipeline` is `null`, because nothing was named; the choice is
on the classify step and on the child. The request with a pipeline in it
was refused at the edge with the declaration's own words before any of this
ran.

### 6.7 The replay afterwards, and what the day adds up to

`main.js replay --pipeline agentic-design`, run once every orchestration
had finished: 54 iterations across 54 runs (13 new today), `standard`
reproducing every recorded decision, `dimension-floor` agreeing with
`standard` on all 54. One number in its summary moved: the lowest
`soundness` among standard's accepts fell from 85.7 to 62.5 — and that
accept is the lost-sample one of §6.2. A floor at 50 would not have held it;
the register's ENG-2 and SEAM-2 would.

Thirteen runs, 202 exchanges, an hour and three quarters on the
subscription, one prompt at a time. What they say, in order of how much it
changes what a reader should do:

1. **A single agentic run's overall is good to about four points, and its
   decision is good to one lost sample.** With every sample present the
   loop agreed with itself on the same brief within 3.7 (calibration 2), on
   a fixed artifact within 4.2 and 0.6 (the two second opinions). With one
   critic sample lost it moved 13.5 and flipped a gated blocker off. Retry
   the miss (SEAM-2); do not add samples.
2. **A recorded verdict carries the judges that made it.** The 82.8 was a
   pre-two-wave verdict; the current loop gives 70.6–74.8 for that artifact,
   and 6.5 shows it giving a post-two-wave verdict back within a point. Any
   comparison across the 2026-09-08 line should be made through a second
   opinion, not from the stored numbers.
3. **Type-level agreement is readable; key-level agreement is not, yet.**
   Chained refs (ENG-3) make every confirmed finding's key unique to its
   run. The reconcile already compares keys under `provided` alignment; the
   day anchor grouping lands, the same reports fill in.
4. **The router does not need attention.** 25 of 25 at four seconds; the
   persona's rule — decide from what an answer would have to be — held
   across two judges and twenty-five briefs. It earns its check when a third
   judge or a new archetype arrives.

What it did not measure: whether a second iteration narrows the spread
(every sample here was one iteration), whether the spread differs on
`system-design` (every sample here was agentic), and anything about the
memory orchestrator, which this work left exactly as it was.

---

## 7. What stays where it was, on purpose

Samples run one after another; concurrency is a knob nobody has asked for
and the subscription client has argued against. There is no `evidenceRefs`
beside `locationRefs` (ENG-4), so a second-opinion panel over lens variants
is a declaration only once a sibling pipeline shares an output codec. The
reconcile has no thresholds and will not get any: the number it should alarm
on is a policy question, and the answer belongs on a pipeline, read off
these reports. And the classifier is one call with no retry, like every
other call on the subscription route (SEAM-2): an unclassified brief fails
the run honestly rather than being guessed.

## 8. The next compositions

- **Regression** — a seed step whose `provided` stand-in is the recorded run,
  a panel that re-runs its goal, a reconcile over both under `produced`
  alignment: "does this run reproduce?" The seed is the one new step shape.
- **Lens variants** — a sibling pipeline sharing `agentic-design`'s output
  codec with a different critic set; the second-opinion panel declares
  `pipeline: ['agentic-design', 'agentic-design-adversarial']` and names one
  per call. Disagreement between lenses, not between samples.
- **Coach** — a target, then a plan pipeline over its remediations. The
  from-run entry makes any recorded run coachable.
