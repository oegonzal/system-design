# The orchestrators, and how to read what they did

A single quality run answers one question: is this artifact any good? An orchestrator answers questions that need several quality runs — _does this answer get better if it remembers what earlier quality runs learned_, _which
judge does this brief belong to_, _would I get this score again_, _do the judges even agree_.

This page covers what each one is for, how its steps actually work, and what a real recorded orchestration run looks like. Seven are registered; the two the browser session added — `form-memory` and `document-memory` — are documented with that work instead. Every trace below is a real row from the local database, not an invention. Section 2 is the exception: it shows how the studio's grading, coach and prompt generation — plain quality runs, not orchestrations — turn into iterations and revisions, and its traces are real dumps under `static/runs/`, not database rows.

## 1. What an orchestrator is

An orchestrator is **data**: which registered pipelines run, in what order, what each step needs from
the ones before it, and the closed set of reasons its steps are allowed to give. One generic runner
in `orchestrators/runner/` executes any of them and knows no step by name.

### The vocabulary: orchestration, step, run, stand-in

The word "run" means three different things in this package, and only one of them is a unit of work.
Getting these four apart is most of the battle.

```text
orchestration run     one execution of one orchestrator
  └─ step             one entry in its plan: recall, target, digest, store
       └─ quality run one execution of one pipeline
            └─ iteration   one produce, judge, decide cycle
```

| Term                  | What it is                                 | Where it lives                                            |
| --------------------- | ------------------------------------------ | --------------------------------------------------------- |
| **orchestration run** | The whole thing you started with one POST. | A row in `orchestration_run`, with one id and one status. |
| **step**              | A slot in the plan. Not work.              | An entry inside that row's `steps`.                       |
| **quality run**       | The unit of work: one pipeline, one goal.  | A row in `quality_run`, plus its own dump folder.         |
| **iteration**         | One produce, judge, decide cycle.          | Rows inside that quality run.                             |
| **stand-in**          | A rule, not a thing. See below.            | The step's `provided` field in the definition.            |

A step exists from the moment the row is opened, sitting at `pending` before anything has happened.
Memory always has exactly four steps whether or not any of them does anything. That is why the record
can explain itself even when the process dies: the plan was written down before the work started.

Note that a step has no "run" of its own. It has a `run` **adapter**, which is the function that does
the step's work, and when that adapter executes it may open quality runs. So three different things
wear the same word: an orchestration run, a quality run, and the `run` field on a step.

**The convention on this page:** the word "run" never appears unqualified. It is always either an
_orchestration run_, a _quality run_, or the backticked `run` adapter of a step. Where you see a bare
"runs" it is the verb.

### How many quality runs a step opens

A step is not one unit of work. Its adapter decides how many quality runs to open, and the answer is
none, one, or many. Measured across all 104 recorded orchestrations:

| Step                                    | Quality runs it opens | Why                                      |
| --------------------------------------- | --------------------- | ---------------------------------------- |
| `memory` / `store`                      | none                  | It writes vectors; it runs no pipeline.  |
| `router` / `classify`                   | none                  | One model call, no pipeline.             |
| `calibration` / `reconcile`             | none                  | It reads runs that already finished.     |
| `second-opinion` / `reconcile`          | none                  | Same.                                    |
| `memory` / `recall`, `target`, `digest` | one each              | One pipeline each, per orchestration.    |
| `router` / `judge`                      | one                   | The judge the classifier chose.          |
| `second-opinion` / `first`              | one                   | Or none at all, when a run is handed in. |
| `calibration` / `panel`                 | one per sample        | The whole point: N tries at one brief.   |
| `second-opinion` / `panel`              | one per sample        | N fresh judgements of one artifact.      |

One real memory orchestration resolves to four steps, three child quality runs, and four iterations
between them, because the quality run under `digest` needed two iterations while the other two needed one each.

### Where the stand-in fits

A **stand-in** is not a level in that ladder. It is a rule attached to a step, declared as `provided`,
saying what an already-finished quality run counts as.

Normally a step opens a new quality run beneath itself. A stand-in points the step at a quality run
that finished days ago instead, so the step settles the moment the record opens and executes nothing.
The step still exists, still carries a status, and still publishes an output for later steps to read.
It simply never ran.

The borrowed quality run is still recorded as the step's child, so the record links it and you can navigate
from the orchestration to the artifact it re-judged. In all three recorded second opinions, that
child's own start time predates the orchestration that claimed it, which is the clearest possible
signal that the step did not open it.

So: an orchestration is made of steps, a step may open quality runs, a quality run is made of
iterations, and a stand-in is the one way a step can be satisfied by a quality run it did not open.

### What a step declares

A step is one object. `id` and the `run` adapter are required; the rest are declarations the runner reads.

| Field      | Type                        | What it is                                                                                                                                                                                   |
| ---------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`       | `string`                    | Its name in the record and the key its output is stored under.                                                                                                                               |
| `needs`    | `string[]`                  | Step ids whose **output** it consumes. Checked before the step runs: if any named step published nothing, this one is skipped and the record names the blocker.                              |
| `pipeline` | name, list, or chooser      | The registered pipeline(s) this step is allowed to run. A chooser is called at run time, after `needs` are satisfied, so it can pick from what earlier steps produced.                       |
| `provided` | `(run) => StepResult`       | The **stand-in**: given one already-finished quality run, return the result this step would have returned. Sync, no work done. Only consulted when the orchestration was started from a run. |
| `run`      | `async (ctx) => StepResult` | The **work**: the function the runner calls when the step's turn comes. Gets the request, earlier outputs, the ports, and an `execute` for opening child runs.                               |

Every step returns the same `StepResult` either way: a `status`, an optional `reason` and `note`,
`counts`, and an `output`. The `output` is the only part later steps can read, and a step that
publishes none blocks whatever needed it, even when it completed.

A step can never run a pipeline it did not declare. The runner resolves the declared list, hands the
step an `execute` that checks every call against it, and throws if the step reaches outside.

### `run` versus `provided`

The `run` adapter says how to do the step. `provided` says what an already-finished quality run counts as instead.

The only trigger for `provided` is starting with `POST /orchestrations/:orchestrator/from-run` and a
body carrying `{ runId }`. The service loads that quality run and hands it to the runner, and two things
happen before the step loop starts: the step's record entry is settled as `skipped` with reason
`provided-run`, and whatever the stand-in returned as `output` is seeded into the outputs map. The
loop then sees the entry is no longer pending and steps over it. The step's `run` adapter is never called.

Because it is consulted twice, once to settle the entry and once to seed the output, a stand-in must
be deterministic and free of side effects. That is also why a stand-in is synchronous while the `run` adapter is not: it
has to be answerable before anything has executed.

Only three steps in the whole package declare one:

| Step                       | Stand-in returns                   | Effect of `/from-run`                                    |
| -------------------------- | ---------------------------------- | -------------------------------------------------------- |
| `memory` / `recall`        | a skip with **no output**          | Do not recall; the target falls back to the bare goal.   |
| `memory` / `target`        | the finished run **as the output** | Do not re-run anything; digest the run you were given.   |
| `second-opinion` / `first` | the finished run **as the output** | The recorded run becomes the artifact to re-judge, free. |

Memory's two together mean one thing: pointing memory at an existing quality run says "digest this and store
what it taught". Three real records show exactly that, with the last two steps doing genuine work:

```text
recall                target                digest    store
skipped provided-run  skipped provided-run  complete  complete, 5 chunks
skipped provided-run  skipped provided-run  complete  complete, 6 chunks
```

Calibration and router declare no stand-ins at all, so starting either from a finished quality run still does the full work; it only borrows the goal and pipeline from the source.

### Starting one, and why nothing comes back

Every orchestration is started with a POST that answers **202 Accepted** and a body of just
`{ orchestrationRunId, status }`. The work runs detached in the background — a memory orchestration run in the records below took 20 minutes — so you poll `GET /orchestrations/:id` for the result. There is no CLI
subcommand; HTTP is the only door.

Before the row is opened, the service applies the definition's `normalize`, then checks the target
rule (`takesTarget`), then 404s an unregistered target, then applies the orchestrator's own `refuse`.
Three of the four refuse a target whose `goalSource` is `composed` — those pipelines eat a generated
goal, not a brief, so they are not something you can point an orchestrator at.

### Briefs and composed goals

Every pipeline eats one thing: a **goal**, which is always markdown. What differs is where that
markdown came from, and each pipeline declares which kind it takes as its `goalSource`.

A **brief** is a goal a person could have written: a prompt describing something to design. It is
prose with headings, and nothing in the system generated it on the way in. One of the twenty-five
shipped with the repo opens like this:

```text
# Unify online and in-store orders behind one history

## Scenario
A retail brand sells online through a hosted storefront platform and in stores through a
separate point-of-sale system. ... Design the service that produces that list.

## Functional requirements
1. A signed-in shopper sees one Order History list inside the storefront account area.
...
## Non-functional requirements
| Kind | Requirement | Target |
```

A **composed goal** is markdown a program built from typed data. It is still markdown, because the
model can only read markdown, but nobody typed it: it exists only because an earlier step produced
the data it is made of. The code that builds it is a **codec**, and for the two pipelines that carry
their own it lives in the pipeline's folder as `input.ts`.

Why bother? Because some pipelines grade things that are not prose. `memory-recall` judges a set of
retrieved chunks. `experience-digest` judges a finished run. Neither of those is a document, so
something has to turn the typed thing into one.

Here is a real one, from a recorded `memory-recall` run, shortened. Four parts, in order:

```text
# Memory query

# Prompt — Retrieve past design evidence: a RAG pipeline over quality-loop outputs
   ...the whole brief the memories are being recalled *for*, pasted in as the query...

## Candidates

### [m1] finding · run 2026-09-07T06-00-31-…-quality · system-design · iteration 1
         · decided revise · 2026-09-07 · ref scale_mismatch|capacity.4,…,risk.1
scale_mismatch (critical) at capacity.4, …: Query-side embedding is never counted: at
50 qps peak each search issues one 1-input embedding call = 3,000 req/min, 3x the …

### [m2] finding · run 2026-09-07T06-00-31-…-quality · …
   ...twelve of these...

## Rules
- Keep a chunk only for what its own text says; an insight the chunk does not state
  may not be attributed to it.
- A chunk whose own iteration was decided reject or escalate may inform a risk, never
  a recommendation.

## Limits
- Keep at most 6 of the 12 candidates.
- Give every candidate exactly one verdict, kept or dropped.
- Validators check these limits; they are not criteria.

## Index
{ "pipeline": "memory-recall", "maxKept": 6,
  "candidates": [ { "alias": "m1", "source": { "runId": "…", "kind": "finding",
                    "decision": "revise", "iteration": 1, "when": "2026-09-07" } }, … ] }
```

Three things in that are worth naming, because they are what "composed" buys and a hand-written
brief could not give you:

- **Engine-assigned aliases.** Every candidate is labelled `[m1]`, `[m2]`, and the pipeline's output
  schema only accepts those aliases. So a lens cites `m4` rather than quoting text back, and a
  citation can be checked rather than believed.
- **A fenced JSON index at the end.** The same facts the prose carries, in a machine-readable block.
  The pipeline's validators read that block — never the prose — to check deterministically that every
  alias cited was listed, that each got exactly one verdict, and that the kept count is within the
  limit. The goal is therefore both the prompt and the contract it will be checked against; the index
  section is for the contract alone, and the engine takes it off before every prompt.
- **Limits stated as limits.** "Keep at most 6 of the 12" sits under its own heading and says plainly
  that validators enforce it and it is not a criterion, so a bound the model must respect is never
  confused with something it is being graded on.

The round trip is the point: a codec writes typed data down as markdown, and a validator reads the
index back as typed data. Both halves live in the pipeline's own folder, which is why the engine
never has to know what a memory chunk is.

### What each pipeline takes

Six pipelines, and **two of them take a brief**. That is the whole reason the router has exactly two
routes.

| Pipeline               | Takes    | What its goal actually carries                                                                                     | Built by                                                       |
| ---------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `system-design`        | brief    | a prompt describing a system to design                                                                             | a person, the library, or `design-prompt`                      |
| `agentic-design`       | brief    | a prompt describing a workflow of agents, tools and rules                                                          | the same                                                       |
| `memory-recall`        | composed | the query, the admissibility rules, the probes searched under, and up to 16 candidate chunks with their provenance | the memory orchestrator, through the pipeline's own `input.ts` |
| `experience-digest`    | composed | one finished run: its decision, stop reason, prompt, artifact, iterations, criteria and findings                   | the memory orchestrator, through `input.ts` and `from-run.ts`  |
| `system-design-canvas` | composed | the practice prompt — **plus** supplied criteria and the author's canvas handed in as the artifact                 | the studio                                                     |
| `design-prompt`        | composed | an engineer's recorded experience, rendered to markdown                                                            | the studio                                                     |

Read down the "Built by" column and there are really three groups, not two. Two pipelines are fed by
a human. Two compose their own goal inside the loop, with a codec that lives in the pipeline's own
folder beside the definition. Two are fed by the studio from something it already stored.

`system-design-canvas` is the one worth a second look, because its goal _is_ a practice prompt and
reads exactly like a brief. It is still `composed`, and correctly so: the goal alone is not a
runnable request. The run also needs the criteria the rubric already derived and the author's canvas
handed in as the artifact. Declaring it `composed` is what stops anything dispatching a bare prompt
to it and getting a confident grade of a canvas nobody drew.

The distinction is not cosmetic. A composed-goal pipeline is **never** a route, never a target you
can point an orchestrator at, and never a choice in the UI — three of the four orchestrators refuse
one outright. Handing a human prompt to `memory-recall` would not fail loudly; it would produce a
confident reading of something that was never there.

### Where a brief comes from

Three places, and the third is the interesting one.

1. **The shipped library.** Twenty-five markdown files under the package's `prompts/` directory, ten
   describing systems to design and fifteen describing workflows of agents. The service walks that
   directory on every request and serves them from `GET /prompts`, so adding a file is enough.
2. **Whatever you paste.** The goal is just a string on the request. Nothing validates that it is a
   brief rather than a shopping list; what protects you is the classifier refusing to guess, and the
   grade that follows being obviously wrong.
3. **A pipeline that writes one.** `design-prompt` takes an engineer's recorded experience and
   produces a structured draft — title, scenario, functional requirements, a non-functional table, a
   scale table, constraints — which the studio renders to markdown. That markdown is then a brief
   like any other, and can be routed and judged. So the loop can generate its own inputs: one
   pipeline's artifact becomes another's goal.

### The record

The **record** is one orchestration run, as a document. One record, one id, one row in
`orchestration_run`, one entry in `GET /orchestrations`.

What it holds:

| Field                      | What it is                                                                |
| -------------------------- | ------------------------------------------------------------------------- |
| `orchestrationRunId`       | its own id — the one you poll                                             |
| `orchestrator`, `pipeline` | which orchestrator ran, and the target it was pointed at (null when none) |
| `status`, `error`          | running, complete or failed, and why if it failed                         |
| `request`                  | the goal **as asked for**, before any step appended anything to it        |
| `context`                  | what the orchestrator observed when it opened — availability, mostly      |
| `steps`                    | the ledger: one entry per declared step, keyed by step id                 |

And each step entry: `status` · `reason` · `note` · `counts` · `runIds` · `report` · `startedAt` /
`finishedAt`.

**What it does not hold is the work.** A step's `runIds` names its child quality runs; it does not
contain them. Each of those is its own record — its own row in `quality_run`, its own iterations,
its own dump folder with every prompt and reply. So the orchestration record is a plan with outcomes
and pointers, deliberately small, while the evidence lives one level down.

That shape explains three things that otherwise look odd:

- **It exists before the work does.** The record is opened with every declared step already listed
  as `pending`, so it is readable the moment you get the id back, and a step that never ran still
  says so rather than being absent.
- **It is written whole, over and over.** Every transition flushes the entire record, on one serial
  chain, so the row is never half-updated and a dropped write heals on the next one. The in-memory
  record is the truth; the row is a copy that keeps catching up.
- **It can explain a crash.** Because the plan was written down first, a process that dies mid-run
  leaves a record where the running step is `failed` and every step that never started is `skipped`,
  each carrying a reason.

The scope boundary in one line: **an orchestration record answers "what did this orchestration
do", and a quality run's own record answers "what did that pipeline find".** Neither nests inside
the other; the step's `runIds` is the join.

## 2. How the studio's grading, coach and prompt generation use runs, iterations and revisions

None of the studio's three flows is itself an orchestration. A Submit and a prompt generation each
start exactly one **quality run** of one pipeline. A coach start opens two: the coach's own quality
run and, unless the recall is skipped, a `memory-recall` quality run that names the coach run as
its parent. Of the studio's own rows, only a revision (`design_revision`) points at a (quality run,
iteration) pair. A generated prompt has no run or iteration pointer: its `prompt_generation` row is
keyed by the run id and points at the claimed prompt, and the prompt is a copy of the best
iteration's draft. Everything below the quality run in section 1's ladder still holds. What
the studio adds is one more word, **revision**, and most of the confusion comes from reading a
revision as an iteration, or an iteration as a revision.

The coach also reads from and writes to the lesson store. The recall picks lessons for its producer
before iteration 1. After the coach quality run completes, the first studio read of it — a poll —
hands it to `POST /orchestrations/memory/from-run`, whose memory orchestration opens an
`experience-digest` quality run over it and stores what it taught (section 4). If nobody polls,
nothing is digested.

### Three questions, answered first

- **Does each coach iteration feed the next?** Only while it wins. Each coach iteration's producer
  revises the **best** design so far, with the **best** iteration's fixes, and the best is not
  always the iteration just before. The chain moves forward only while each iteration beats the
  best. An iteration that does not is discarded, design and fixes alike, and the next one revises
  the best with the best's fixes again — byte-identical in 22-30-00 below, before setbacks — plus,
  if the loser was blocked by a validator, that validator's notes as refusals, or, if its judges
  read it, what they confirmed wrong with it as setbacks. The producer works from the original
  submission only while it is still the best. The judges grade every iteration from scratch: they
  never see an earlier grade or what the producer was asked to fix.
- **Is the coach applying the fixes?** Yes. Its producer is handed every remediation the best
  iteration selected, each with its rationale, and told to "Return the WHOLE artifact again with
  every remediation applied". Nothing checks them one by one; the only verdict is the next grade.
  In 18-01-11, iteration 2 was handed the grade's 15 fixes. Its grade moved c7 to pass and c4 and
  c9 from fail to partial, left the other five targeted criteria where they were, and the score
  rose from 55.6 to 57.8.
- **What does "Below the accept threshold — N fixes to make." mean on a coach revision?** N counts
  the open problems that **that revision's own grade** found: its criteria that settled fail or
  partial, its confirmed findings marked `fixable_local` or `requires_retry`, and one per validator
  that reported problems. A finding
  reconciled to one of those criteria is counted twice, once on each side. It is not a count of
  fixes the coach skipped: after 18-01-11's revision, the 17 were 9 findings, all with new keys, and
  the 8 criteria still short. Only the count reaches the UI.

### The vocabulary

| Term                              | What it is                                                                                                                                                                                                                                                       | Where it lives                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **quality run**                   | One pipeline on one goal: a grade, a coach, or a prompt generation.                                                                                                                                                                                              | A row in `quality_run`, and `static/runs/<runId>/`.                               |
| **iteration**                     | One produce, judge, decide cycle inside a quality run. `maxIterations` counts iteration 1 too.                                                                                                                                                                   | `trace.iterations[k - 1]`, and `04-iterations/0k/` in the dump.                   |
| **mode**                          | How an iteration got its artifact. See the next table.                                                                                                                                                                                                           | `iteration.mode`                                                                  |
| **artifact**                      | What one iteration judged: a canvas (graph, brief, narrative) or a prompt draft.                                                                                                                                                                                 | `iteration.artifact`                                                              |
| **decision**                      | The controller's verdict on one iteration — accept, revise, retry, escalate or reject — with its overall score and the gate or route that settled it. Deterministic: no model decides.                                                                           | `iteration.decision`                                                              |
| **remediation**, the UI's **fix** | One thing the producer could act on, selected from that iteration's evidence, with a prose note. "N fixes" is a count of these.                                                                                                                                  | `decision.selectedRemediations`; with notes, `remediations.json`                  |
| **best iteration**                | The iteration with the strictly highest overall score so far. A tie keeps the earlier one.                                                                                                                                                                       | `trace.bestIteration`                                                             |
| **revision**                      | A studio row: one version of the design in the session timeline, pointing at the one (quality run, iteration) that grades it. Origin `user` — a Submit, or the draft a coach starts from — or `assistant`, badged **AI**: a coach iteration the studio imported. | `design_revision`, by `qualityRunId` and `qualityIteration`                       |
| **coaching run**                  | The studio's row for one coach start: its quality run, its base revision, its budget.                                                                                                                                                                            | `coaching_run`                                                                    |
| **recall**                        | Lessons from earlier quality runs, picked once before a coach's iteration 1 by a child `memory-recall` quality run, and given to every producer call in it. Never to the lenses. A grade never recalls; the coach section says when a coach does not.            | the quality run's `recall`; the producer's "Lessons from earlier runs (advisory)" |

| Mode       | Iteration | Producer called?                                             | What gets judged                                                                                               |
| ---------- | --------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `provided` | 1         | no                                                           | the caller's artifact, exactly as handed in — a Submit, or a coach's draft                                     |
| `adopted`  | 1         | no, and no lens runs either                                  | nothing: a recorded iteration of an earlier quality run is copied verbatim, decision and remediations included |
| `initial`  | 1         | yes, from the goal                                           | the producer's first artifact — prompt generation                                                              |
| `revise`   | 2 and on  | yes, from the best artifact so far and its remediations      | the rewrite, from scratch                                                                                      |
| `retry`    | 2 and on  | yes, from the goal, with the best's remediations as pitfalls | the new attempt, from scratch                                                                                  |

There is no `fresh` mode; "a fresh attempt" is how the code describes `retry`. After iteration 1,
an iteration's mode is the previous iteration's decision when that decision was revise or retry.
The canvas pipeline's controller never decides retry, so every coach iteration after the base is a
`revise`.

Three rules hold in every flow below:

- **The judges start from scratch each iteration.** Critics see the goal, the whole rubric, the
  current artifact, its locations and its validation results. Evaluators see the goal, only the
  criteria of their own kinds, the artifact, its locations, and the findings the critics confirmed
  in the same iteration: both studio pipelines declare their evaluators `consumes: ['findings']`,
  so they run as a second wave after the critics. Only critics see validation results. Neither ever
  sees an earlier iteration, a score, or what the producer was asked to fix.
- **The rubric is fixed before the quality run starts, except in prompt generation.** A grade or a
  coach is handed the prompt's rubric verbatim and never derives one. That rubric is built once per
  prompt: from the draft for a generated prompt, which is never re-derived; for an authored or
  imported prompt through `POST /criteria` when it is created (`ensureCriteria` only fills a rubric
  that is still empty), and it can be re-derived or replaced by rewriting the markdown until a
  session cites it. Only design-prompt derives its rubric inside the run.
- **The producer never sees a score.** It sees the goal, every criterion's id, kind and statement —
  never which ones passed — any recalled lessons, and on a revise the best artifact with that
  iteration's remediation notes.

### Grading: Submit is one judgement

```text
  Submit
     |
     v
  quality run    system-design-canvas · goal = the prompt's markdown · criteria = its rubric
     |           output = the canvas · maxIterations 1 · no recall
     v
  iteration 1    provided — no producer call; the lenses judge the canvas as handed in
     |           -> a decision, an overall score and N remediations, stored on the iteration
     v
  stops          max-iterations when decided revise; accepted, rejected or escalated otherwise.
     |           the UI shows no stop reason for a grade: a grade finishing is not news
     |
     v
  revision #n    origin user, pointing at (this quality run, iteration 1); the saved draft clears
```

With an artifact supplied and a budget of one, the quality run can never call its producer, so
nothing applies the remediations it selects. The author does not see them either, only their count
N. The notes are producer input, and they reach a producer only if a coach later adopts this
iteration — remediations and all — as its iteration 1. Otherwise the author works from the Feedback
tab's failing criteria and findings, which overlap the list but are not it.

The revision row stores a pointer and a cache of status, overall and decision. Its Feedback tab is
read live from that iteration. "Grade again" starts a fresh one-iteration quality run and repoints
the same revision. It is allowed when the grade failed or is unscored as `unassessed`
(`regradable`), never for a grade unscored as `no-artifact`, and always for a revision with no
grade at all: the grader no longer has its run, or it was stored before grading moved to the loop.

#### What "Below the accept threshold — N fixes to make." means

The UI words it from what settled the decision; it never reads the controller's sentence. It picks
this wording when the deciding step is the route (factor `route`), the decision is revise, and at
least one remediation was selected. The route decides only when no gate did: no blocking validator,
enough criteria assessed, nothing blocking, and an overall below `acceptAt` (75) but not below
`rejectBelow` (30). In the canvas pipeline it also covers the route's retry turned revise ("N
remediation(s), all requiring a fresh attempt — applied as a revision"). When something else
settles the decision, a canvas row reads differently:

| What settled it                                 | The row reads                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| a blocker a revision can fix (`policy-allowed`) | "Blocked by … — to fix before it can be accepted."                                                   |
| an `unfixable` blocker                          | "Blocked by … — no revision can fix that, so it is rejected."                                        |
| a `requires_user` blocker                       | "Blocked by … — it needs a person’s judgement."                                                      |
| a blocking validator                            | "Failed N structural checks — to fix before it can be accepted."                                     |
| an overall below 30                             | "Below the reject floor of 30 — far enough off to need reworking, not touching up."                  |
| the route, with no remediation selected         | "Below the accept threshold, with no fix the lenses could point to — it needs a person’s judgement." |

N is the length of **that iteration's own** remediation list. Everything below is included, worst
first, with no cap and no deduplication:

| Source              | Selected when                                         | The note the producer reads                |
| ------------------- | ----------------------------------------------------- | ------------------------------------------ |
| a confirmed finding | its fixability is `fixable_local` or `requires_retry` | the first critic rationale given for it    |
| a criterion         | it settled `fail` (high) or `partial` (medium)        | `<statement>: <first evaluator rationale>` |
| a validator         | it reported problems, warn gate included              | its problem messages                       |

Findings marked `requires_user` or `unfixable`, and criteria that passed, never become fixes.

So N is what the judges still found in **this** artifact. It is not a count of fixes the coach
applied, and after a coach revision it is mostly new critique of that revision. It also overcounts
distinct problems. A finding is reconciled to the first criterion it names that settled fail or
partial; it is charged once in the score, but listed twice here, once as the finding and once as
the criterion. The studio API receives the whole list from the loop, notes included, but its own
DTO reduces it to a count, so the UI shows only N. The nearest thing to the list is the Feedback
tab's failing criteria and findings.

### Coach: one quality run, a base, and at most `maxIterations` − 1 revisions

```text
  Improve
     |   unedited revision, grade complete and scored  -> adopt its (quality run, iteration)
     |   edited canvas, or nothing graded to adopt      -> store the draft as revision #n, user
     v
  quality run    system-design-canvas · the same goal and rubric as the grade
     |           maxIterations = the request's, default 3, at most 10 · recall on
     v
  recall         a memory-recall quality run, the coach run its parent, unless skipped (below);
     |           its lessons go into every producer call below
     v
  iteration 1    the base — adopted (copied verbatim, not judged again)
     |                   or provided (the draft, judged now: this is its grade)
     v
  iteration k    revise — the producer rewrites the BEST artifact so far,
     |           applying the BEST iteration's remediations; the lenses judge it from scratch
     |           beats every earlier score?   yes -> imported as an AI revision; the new best
     |                                        no  -> not-better; nothing stored; best unchanged
     |           (an iteration with no score is no-artifact or unassessed, never not-better)
     v
  stops          accepted · rejected · escalated · plateau · max-iterations · produce-lost
     v
  digest         on the first studio poll that sees it complete, the memory orchestrator
                 (section 4) opens an experience-digest quality run over it
```

**Iteration 1 is the base, never a coach revision.** Adopting copies the graded iteration's
artifact, ledger, decision and remediations, and no lens runs; the base's own grade is untouched.
From a draft, the draft is stored as a new user revision first, and iteration 1 is its grade. An
unedited revision whose grade was unassessed is refused: there is no score to improve on.

**The recall can be skipped.** No recall run opens when embeddings are disabled, the embedding call
fails, the store is unavailable, empty or returns no hits, `memory-recall` is not registered, or no
recall is bound to the runs service, nor for a run that can never call its producer — a budget of
one. When the base was adopted, the recall is focused on the defects the base iteration's grade
found.

**A coach's recall screens out what its producer already holds.** Adopting copies the base's ledger
and remediations, and a sibling coach run that adopted the same iteration copied them too, so
lessons digested from that chain restate what the producer is about to be handed. The recall walks
the chain — the base, then what the base's run had adopted, and so on, one recorded run read per
link — searches three times wider than it offers (48 candidates for 16 slots), and sets aside after
fusion, first match wins:

| Reason            | A stored lesson is set aside when                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `chain-iteration` | its run is in the chain, at an iteration no later than the chain's; a later iteration of a chain run is offered, with origin `chain`     |
| `sibling-copy`    | the evidence it cites was judged in exactly a link of the chain (`lineage.judged`): its run copied what the producer holds               |
| `known-evidence`  | it is of the same pipeline — and the same prompt, when its lineage records one — and every finding it cites is a base-ledger finding key |

Lessons another run digested from the same evidence of one prompt collapse into one slot. Each
reason's action — exclude, or demote to last — is one declared table (`EXCLUSION_POLICY`). The
curator is shown the producer's first eight remediation notes under "## Already in hand — do not
restate", with a rule that a candidate only restating one is dropped, and each candidate's origin —
`chain`, `same-prompt`, `same-pipeline` or `other-pipeline`. A chunk it keeps that only restates a
held defect is a `restated_defect` finding, priced and never gating, and is withheld once confirmed.
A search whose every lesson was set aside opens no recall run and is recorded `empty` with
`nothing-new`. The run's recall records the chain, the counts and every lesson set aside with what
it matched (`recall.novelty`), and run.md prints them under "## Recall". A run that adopted nothing,
and the memory orchestrator's recall, screen nothing and compose the query they always did.

**What iteration k's producer is given**, for k of 2 or more, in this order:

1. the goal — the prompt's markdown — and the rubric's criteria;
2. the recalled lessons, the same in every iteration of the quality run;
3. under "Your previous artifact", the **best** artifact so far, which is not necessarily
   iteration k − 1's;
4. under "Remediations to apply", **every** remediation note of that best iteration;
5. only when iteration k − 1 was blocked by a validator and did not become best, that iteration's
   validator notes, as refusals;
6. the instruction "Return the WHOLE artifact again with every remediation applied and everything
   that was not criticised preserved."

It sees every criterion, passed or not, but never which ones passed. It never sees a score, a
finding marked `requires_user` or `unfixable`, or what a losing iteration's judges said beyond the
finding notes its policy selected (its setbacks) and refusals.

**Do fixes accumulate from one iteration to the next?** Only while each revision wins, as the
answers at the top of this section say. If iteration 2 beats the base, iteration 3 revises
iteration 2's canvas against iteration 2's remediations. If it does not, iteration 2's canvas and
remediations are dropped from the briefing, and iteration 3 gets what iteration 2 got: the base
and the base's remediations, plus iteration 2's validator notes as refusals if a validator blocked
it, or the findings its judges confirmed as setbacks if they read it. Each grade's remediations are
a new list, not the old one with items crossed off.

**Lessons are a record, not feedback.** The loop re-derives the lessons — `resolved`, `persisted`,
`improved`, `regressed` — into the live trace after every iteration, not only at the end. None of
them is fed back to the producer.

**When it stops.** Accept, reject and escalate end the quality run whatever budget is left — except
an iteration whose producer returned nothing to judge. That iteration is still decided and recorded
(no artifact, so it escalates), and it spends its place in the budget, but the loop then asks again
in the same mode from the same best, with every fault the schema refused the reply for named under
its own heading. It takes no crown and counts toward no plateau. The run stops `produce-lost` only
once it has lost more produce calls than the policy's `loop.lostProduces` (1 on every pipeline) or
has no iteration left to ask in, and its final decision is then the last one made on an artifact.
Otherwise it stops on a plateau (`plateauAfter` 2: two iterations in a row that did not beat the
best) or when the budget runs out.
The budget counts the base, so the default of 3 allows at most two revisions, and a base that
neither of them beats ends as `plateau` when the last one is decided revise (an escalate or reject
on it ends the run as `escalated` or `rejected` instead).

**A size limit never discards a revision.** Every string and list a model writes is one declared
bound: a target it is asked for and a ceiling the schema accepts. A field written past its target is
kept whole and recorded — a warning on the `bounds` validator, whose info problems are never
remediations, and an `overrun` diagnostic, neither of which moves a decision; prose past three times
its target is cut at a word boundary with ` […]`, and a list past its ceiling is trimmed from its
end. Only a structural fault — a wrong type, a missing field, an unknown id or enum value, an empty
required string — refuses the reply, and the next attempt within the same call is told each fault,
with the reply as written when it is at most 60,000 characters. A turn that ended without a result
is still read from what it streamed. A lens sample that is lost scores but cannot gate
(`evidence.lostSample: 'score-only'`): what the lens's other sample saw is priced with the hits it
really has, and nothing short of the policy's agreement blocks. Every stage is told this rule, and
the HTTP edge measures a goal in bytes, as the engine does.

**Which iterations become AI revisions.** On every poll the studio walks the iterations in order:

| Outcome                     | When                                                                                                                                                                       | Stored                                                                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `base`                      | iteration 1                                                                                                                                                                | it is the base revision                                                                                                                                                       |
| `imported`                  | scored above every earlier scored iteration, and the artifact passes the studio's checks                                                                                   | an `assistant` revision at (quality run, k); blocks already placed keep the base's or an earlier import's position, only new blocks are placed, and no model position is used |
| `not-better`                | scored, but not above the best so far                                                                                                                                      | nothing                                                                                                                                                                       |
| `unassessed`, `no-artifact` | too few criteria assessed, or nothing produced. A canvas a validator blocked is `unassessed` too: no lens judged it, yet the loop decides revise and goes on with refusals | nothing                                                                                                                                                                       |
| `refused`                   | it would be imported, but the artifact is not a valid submission                                                                                                           | nothing; the problems are listed                                                                                                                                              |

The loop crowns its best by the same strict rule, so the AI revisions are normally exactly the
canvases the next iteration revised. The one exception is a `refused` iteration: it still raises
the studio's bar and is still the loop's best, so the next revision builds on a design the timeline
never showed. Revision numbers are not iteration numbers: each new revision is the session's
highest number plus one. A coach started from revision #4, when #4 is the session's newest, that
imports iterations 2 and 3 creates #5 and #6.

**Across coach quality runs.** Load an AI revision, leave it unedited, and start the coach again:
the new quality run adopts that revision's iteration, so coach quality runs chain. "Restore as
draft" turns the revision's content into an editable draft instead, so the next coach start or
Submit creates a new user revision and grades that content again. The canvas stays editable while a
coach runs; those edits are saved as the draft and never reach the running coach.

### Prompt generation: one quality run of at most two iterations

```text
  Generate a prompt (from an experience)
     |
     v
  quality run    design-prompt · goal = the experience rendered as markdown
     |           maxIterations 2 · no criteria, no output, no recall
     v
  derive         once: up to 12 criteria of kinds fidelity, gradeability, scope
     v
  iteration 1    initial — the producer drafts from the goal and those criteria
     |           accept, reject or escalate -> stops here
     v
  iteration 2    revise — iteration 1's draft and all of its remediations
     |           or retry — start again from the goal, those remediations shown as pitfalls
     v
  claim          the BEST iteration's draft, whatever its decision, becomes a Prompt:
                 markdown rendered from the draft · rubric = one criterion per draft row
```

The studio asks for two iterations, and two is also the pipeline's own budget. "Writes, is
criticised, and rewrites once" is the best case: there is a second iteration only when the first
is decided revise or retry. This pipeline uses the STANDARD controller, so unlike the coach it can
retry. A plateau can never stop it, because at two iterations at most one can stall.

Iteration 2 revises iteration 1's draft — iteration 1 is necessarily the best at that point —
against all of iteration 1's remediations, and is judged against the same derived criteria. The
studio then claims `trace.bestIteration`, which is iteration 2 only if it scored strictly higher.
It does not check the decision.

Two different rubrics are involved:

- the **design-prompt rubric** (fidelity, gradeability, scope) judges the draft, and stays with
  that quality run;
- the **canvas rubric** stored on the Prompt is built from the draft's own rows: one criterion per
  functional requirement, non-functional row, scale row and constraint, `c1…cN`, at most 24. Every
  later grade and coach on the prompt is judged against it.

The author never sees the iterations, scores or decisions. The UI says "Writing a prompt from your
experience…" and then opens the prompt.

Two recorded quality runs show both outcomes. In `2026-10-01T01-35-58-485-f41f79-quality`,
iteration 1 scored 70 and was held by blocker c12, so it was revised with its 12 remediations — 6
findings and 6 criteria; two `requires_user` findings were left out. Iteration 2 scored 75, cleared
the blocker, and was accepted. In `2026-09-30T02-47-07-680-d435e0-quality` the rewrite went the
other way: 79.3 held by blocker c10, then 70, so the draft the studio claims is iteration 1's,
which was never accepted.

### A worked example: one grade and four coach quality runs

One session, as recorded under `static/runs/` on 2026-10-02. Ids are shown without their
`2026-10-02T` prefix and `-quality` suffix, and each block is one quality run.

```text
quality run          kind   # mode      score decision  fixes
17-52-51-261-14477b  grade  1 provided  55.6  revise    15 fixes   no producer call
    adopted as iteration 1 by 18-01-11
18-01-11-209-88e8c4  coach  1 adopted   55.6  revise    15 fixes
                            2 revise    57.8  revise    17 fixes   new best
                            3 revise     0    escalate             no artifact: 3 attempts hit the old 300 s cap
    its iteration 2 adopted as iteration 1 by 18-58-32, 21-53-19 and 22-30-00
18-58-32-016-060007  coach  1 adopted   57.8  revise    17 fixes
                            2 revise     0    escalate             no artifact: 3 schema misses
21-53-19-213-9c5d54  coach  the same: 57.8, then no artifact after 3 schema misses
22-30-00-513-ec64a6  coach  1 adopted   57.8  revise    17 fixes
                            2 revise    55.6  revise    17 fixes   not better, dropped
                            3 revise    64.4  revise    13 fixes   new best; 2 critical findings block it
```

The studio's database was not read for this. Which iterations it imported as AI revisions follows
from the rule above applied to these scores: 18-01-11's iteration 2 and 22-30-00's iteration 3.

**The grade selected 15 fixes and applied none.** They are 7 findings and 8 criteria that settled
fail or partial, and each of the 7 findings was reconciled to one of those 8 criteria — 5 to c2 or
c3, which settled partial, and 2 to c4, which failed — so each finding also stands beside its
criterion in the list. The dump holds no producer exchange.

**18-01-11's iteration 2 applied them.** Its producer was handed the graded canvas, exactly those
15 notes, and 6 recalled lessons. It doubled the design — 5 to 10 nodes, 4 to 15 edges, 3 to 9 brief
bindings — and kept every id the author had used. Against the 15, the next grade shows:

| Targeted   | Next grade                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------- |
| 8 criteria | c7 now passes; c4 and c9 went from fail to partial; the other 5 did not move                                    |
| 7 findings | all 7 keys read `resolved`; by type, 6 of the 7 recur among iteration 2's 9 findings — all but `bad_assumption` |

Whether each finding was fixed, partly fixed or not is a reading of the rationales; the record
does not say. The score rose from 55.6 to 57.8, and one criterion nobody targeted fell (c1, pass to
partial). Judging the new canvas from scratch, the critics confirmed 9 findings, all with new keys,
and 8 of them were against mechanisms the coach had added: the replica, the queue, the aggregator,
the monitoring. Those 9 and the 8 criteria still short are the **17** in "Below the accept
threshold — 17 fixes to make." That is critique of the revision, not a backlog it skipped. Iteration 3 then revised
iteration 2, the best, against those 17, but all three attempts were cut off at about 302 seconds,
so there was nothing to judge, the decision was escalate, and the quality run stopped. That
recording predates a change: it ran at commit 2924192, with the producer's `maxTokens` at 28,000, a
fixed 300 s cap on every call, and three attempts. The cap has since been replaced. A call's limit
now derives from its declared `maxTokens` — 32,000 at 25 tokens/s plus 30 s, about 1,310 s — and
a timeout gets two attempts.

**The next two coach quality runs never had a revision judged.** Both adopted 18-01-11's
iteration 2. In each, the producer made three attempts with identical prompts, and every reply was
refused as a schema miss, mostly for strings over the schema's length limits. Each escalated at
iteration 2.

**22-30-00 shows the best, not the latest, being revised.** Iteration 2 scored 55.6, below the
adopted 57.8, so its canvas and its 17 remediations were dropped. Iteration 3's briefing is
byte-identical to iteration 2's — the same adopted canvas, the same 17 notes, the same lessons — so
it is a second, independent attempt at the same revision. It scored 64.4 and became best. Against
the base, c1 went from partial to pass and no other criterion moved. Its grade confirmed five
findings, two of them critical. None carried over: all five are new keys, judged from scratch, and
none matches a finding of the adopted base or of iteration 2. The two critical ones made the
policy-allowed gate settle the decision rather than the route, so the row reads "Blocked by …"
rather than "N fixes". The quality run then stopped on max-iterations, and its 13 remediations
were never applied.

### Known gaps

Found while tracing these flows. Each is in the code, and the recorded quality run that shows it is
named where there is one.

- **"N fixes" overcounts, and is never listed.** Remediations are not deduplicated against
  reconciliation, so a finding charged to a criterion appears beside that criterion, and warn-gate
  validator problems and every partial criterion count too. The studio API receives the whole list
  from the loop, notes included, but its own DTO reduces it to a count, so only the count reaches
  the UI: the author cannot see which fixes the number means, and nothing shows what the coach
  changed.
- **Closed: a losing revision's critique reaches the next briefing.** It did not: the next
  iteration got the best's briefing again, byte-identical in 22-30-00, so with the default budget a
  lost iteration 2 made iteration 3 a second try at the same revision. A producer that consumes
  `setbacks` — every pipeline whose declared loop reaches a third iteration declares it, since the
  third ask is the earliest a setback can reach, and so does the prompt writer, whose declared two
  a run request can raise — is now told, on the ask after an attempt its judges read and
  found no better than the best, that attempt's confirmed finding notes under their own heading,
  less any the best's remediations already name. A blocked loser's validator notes
  still reach the producer as refusals, and a lost produce's schema faults as refusals of their own.
- **"Your previous artifact" is the best one.** The heading reads as the previous iteration's, but
  after a revision that did not win it is older, and may be the author's own canvas.
- **Lessons compare neighbours, by exact key.** `resolved` and `persisted` compare each iteration
  with the one just before it, not with the best it revised: 22-30-00 records iteration 3's lessons
  as "2→3" for a revision of iteration 1. A finding's key is its type plus the exact sorted set of
  locations it cites. Positional refs to the author's blocks survive appended blocks, so a finding
  that cites the same set again reads `persisted`; one whose cited set changed reads `resolved`,
  whether or not the defect went away. All 7 of 18-01-11's base findings read `resolved`, yet 6 of
  their 7 types recur among iteration 2's 9 findings: contradiction, scale_mismatch,
  topology_defect, unhandled_failure, data_integrity and operability_gap.
- **Closed: one empty producer no longer ends the coach.** It did: no artifact made the artifact
  gate escalate, which was terminal, and attempts within one producer call sent byte-identical
  prompts — 18-58-32 and 21-53-19 each made three identical attempts and stopped at iteration 2,
  their replies lost to a single field 3–19% over its bound. A size overrun is now kept and
  recorded, a structurally refused reply is asked again with its faults named, and a lost produce
  spends one iteration (_When it stops_, above). The producer declares 50,000 output tokens, above
  the 40,173 its longest recorded turn wrote.
- **A screened recall reads legacy lessons by pipeline alone.** A point stored before lineage was
  recorded carries none: `known-evidence` compares it by pipeline rather than prompt, and it never
  collapses as a twin, until `POST /memory/:id/reindex` back-fills its memory run's lineage.
- **Best is the overall score alone.** A blocked iteration can stay best over a later, lower-scoring
  one that was accepted, and prompt generation claims the best draft without checking its decision.
  `2026-09-30T02-47-07-680-d435e0-quality` claims an unaccepted draft, while the design-prompt
  definition's comment says the draft is rendered "once the loop accepts it".
- **Mode and prior can come from different iterations.** The next mode is the last iteration's
  decision, but the prior artifact and remediations are the best's. With at least three iterations
  under a controller that can decide retry, an iteration decided retry that is not the best — a
  validator block, say — makes the next one a retry with no prior, though the best could have been
  revised. The studio's flows cannot meet it: the coach's REVISE_ONLY never retries, and in prompt
  generation iteration 2's mode comes from iteration 1, which is necessarily the best. The `[QL-25]`
  spec's tiny pipeline meets it with three iterations: the comment at `run-pipeline.spec.ts:251-252`
  says iteration 3 "revises the best", while line 253 asserts mode `retry`.
- **A refused import is still the loop's best.** An iteration the studio will not store still
  raises its bar and is still what the loop revises next. Separately, the coach panel says every
  revision "that beats the last" lands in the timeline; the rule is beating every earlier scored
  iteration.
- **The budget counts the base.** The default of 3 is at most two revisions, while the contract
  comment at `sessions.ts:202-203` says the loop "revises up to `maxIterations` times". The dropdown
  offers 1, which can never revise, and a coach can be started from a base already accepted,
  rejected or escalated, which stops at iteration 1.
- **Closed: a manifest's `overall` is the best iteration's.** It was the last iteration's:
  18-01-11's manifest said 0 while its best scored 57.8. The manifest, the index row and `run.md`'s
  verdict line now headline the best iteration, with the last one's score in a clause of its own
  when the last is not the best.
- **A request can raise `maxIterations` past the declaration.** A run request's `maxIterations`
  replaces the pipeline's declared one (`run-pipeline.ts`, `RunsService`), bounded only by
  `MAX_QUALITY_RUN_ITERATIONS`, so anything checked against the declared loop — the registry spec's
  setbacks rule, say — holds for the declaration, not for every run. Capping a request at the
  declared value would close it, but it changes behaviour for every caller that overrides today, so
  it is not done.
- **A duplicate set cannot say which of its members are the twins.** Every duplicate type
  withholds `none`, because a confirmed duplicate finding is the union of the overlapping claims
  its samples made (`sameDefect` groups on a common location), not one claim, so `all-but-one`
  would drop a bystander (`docs/pipelines/memory-runs.md` §16 has the counts). The structural
  follow-up is a reconciliation declared per finding type — overlap, as now, or the exact ref set —
  that would make `all-but-one` sound again for the share of findings that are unions; the share a
  single critic wrote as one oversized set needs the persona's ask instead. Exact-set identity also
  changes what `minHits` confirms, so it needs its own measurement before it is declared.
- **A criterion's fix note may quote the wrong sample.** The note takes the first evaluator
  sample's rationale for that criterion, whatever result that sample gave, so with two samples it
  can quote one that said pass. The recorded quality runs show it: in 6 of 259 fail or partial
  criterion fixes across the non-adopted canvas iterations, the quoted first sample had said pass.
  In `2026-10-02T02-23-28-712-73afe7-quality` iteration 1, c1 settled partial, and its note quotes
  sample 1's pass rationale ("binding.1's path … ends at n-4 with a real INSERT …") while sample 2
  said partial. The spec's `criterion c1: it is there` does not show it: the tiny pipeline's
  evaluator takes one sample, and that sample said partial.

## 3. The reasons, and who writes them

Seven reasons belong to the runner and are available to every orchestrator. Only four of them are
ever chosen _by_ the runner.

| Reason                 | Written by                   | Means                                                  |
| ---------------------- | ---------------------------- | ------------------------------------------------------ |
| `upstream-skipped`     | the runner                   | A step it needs produced no output.                    |
| `upstream-failed`      | the runner                   | A step it needs failed.                                |
| `pipeline-unavailable` | the runner                   | A declared pipeline is not registered.                 |
| `errored`              | the runner                   | The step threw, or gave a reason it never declared.    |
| `run-failed`           | a step adapter               | Its child run produced no trace.                       |
| `provided-run`         | a step's `provided` stand-in | A finished run was handed in, so the step did not run. |
| `interrupted`          | the janitor                  | The service died mid-run and the row was reclaimed.    |

Each orchestrator then declares its own, and may not redeclare one of the runner's. Those are listed
with each orchestrator below.

## 4. `memory` — give a quality run the lessons of earlier runs

**Use it when** you want a quality run both to benefit from and to contribute to the lesson store. The two
directions are independent: a recall that gets refused still leaves a target quality run that digests and stores, and a target that scores badly still digests.

```text
  POST /orchestrations/memory  { pipeline, goal }
        |
        v
  [recall]  runs the memory-recall pipeline
        |   the goal becomes 1 query + up to 6 model-derived conditions = 7 probes
        |   7 probes x 2 named vectors, fused by reciprocal rank -> 16 candidates
        |   the curator keeps at most 8; the kept ones no confirmed finding faulted
        |   are "usable", ranked by how many passing criteria cited them
        |   output: the goal + a "## Remembered evidence (advisory)" section
        |   skips : embeddings-disabled | store-unavailable | store-empty
        |   completes with no output: not-accepted | no-rubric | no-artifact | no-usable-memory | goal-at-budget
        v
  [target]  runs the pipeline you asked for          <-- the deliverable
        |   on the composed goal, or the bare one when recall gave nothing
        |   output: the whole child run
        v
  [digest]  runs the experience-digest pipeline
        |   strips the injected section back off first, so memory is never re-digested
        |   reduces the target quality run to lessons over engine facts only
        |   output: the memories that run endorsed
        |   skips : nothing-to-digest | nothing-new (it judged nothing of its own)
        |   completes with no output: not-accepted | no-rubric | no-artifact | no-memories
        v
  [store]   no pipeline — writes to the vector store
            one chunk per memory, two vectors each (its condition, its lesson)
            skips: upstream-skipped | store-unavailable
```

Its own reasons are `embeddings-disabled`, `store-unavailable`, `store-empty`, `embedding-failed`,
`query-refused`, `not-accepted`, `no-rubric`, `no-artifact`, `no-usable-memory`, `goal-at-budget`,
`nothing-to-digest`, `nothing-new`, `no-memories`. `not-accepted`, `no-rubric` and `no-artifact`
are the engine's `admission` in the orchestrator's words: `not-accepted` is a verdict (judged, and
short of the bar or a gate); `no-rubric` and `no-artifact` mean the child was never judged, and are
kept apart so a deriver's schema miss is never read as a digest that fell short. `query-refused` is
a search whose hits could not be composed into the curator's query, the faults in the note.
`nothing-new` is a target whose only judged evidence is an iteration it adopted: its ledger is a
copy the adopted run's digest already read, and the note names that run.

### A real orchestration run that went all the way through

Target `agentic-design`, 1,192 seconds, three child quality runs:

```text
recall    complete   probes 7 · candidates 16 · kept 8 · usable 5 · injected 5
target    complete   iterations 1 · overall 65.8
digest    complete   memories 8 · kept 5
store     complete   chunks 5 · embedded 10
```

Read it as a funnel. Seven probes found sixteen candidates. The curator kept eight; five of those
survived its own critics unfaulted and were injected into the goal. The target then ran against that
enriched brief and scored 65.8. The digest proposed eight lessons from the finished target quality run and endorsed five. Those five became five chunks and ten vectors — two per chunk, one for the condition it applies
under and one for the lesson itself.

### A real orchestration run that degraded, and still did its job

Target `system-design`, 374 seconds:

```text
recall    complete   reason not-accepted   probes 7 · candidates 16 · kept 0 · usable 0 · injected 0
target    complete   iterations 1 · overall 0
digest    complete   reason no-memories    memories 3 · kept 0
store     skipped    reason upstream-skipped   note "digest"
```

Nothing is broken here. The quality run under `recall` did not clear its own accept bar, so it endorsed nothing and
published no output — `not-accepted`. The target therefore ran on the bare brief, which is exactly
the intent: memory is advisory and its absence is never fatal. The digest proposed three lessons and
endorsed none, so it published nothing either, and the runner skipped `store` naming the step that
blocked it. The orchestration is still `complete`, because none of that is a failure.

### What usually happens

Across the sixteen memory orchestration runs recorded under the current code:

| Step   | Clean | Otherwise                         |
| ------ | ----- | --------------------------------- |
| recall | 14    | 2 `not-accepted`                  |
| target | 16    | —                                 |
| digest | 14    | 1 `not-accepted`, 1 `no-memories` |
| store  | 14    | 2 `upstream-skipped`              |

Fourteen of sixteen went end to end. The recall funnel is stable: always 16 candidates, at most 8
kept, and between 0 and 7 usable.

## 4a. `knowledge` — learn from a finished run, against what is already known

**Use it when** a run has settled and you want what it taught kept in a form another prompt can use.
It is `memory`'s counterpart rather than its replacement, and the difference is the direction of the
question. `memory` asks _does this run go better if it remembers_, so it recalls first and digests
afterwards. `knowledge` asks _what does this run add to what the store holds_, so the recall happens
**after** the target, the answer reaches the digest rather than the producer, and nothing it finds can
change the run being learned from.

```text
  POST /orchestrations/knowledge/from-run  { runId }
  (or POST /orchestrations/knowledge { pipeline, goal }, which runs the target first)
        |
        v
  [target]  the run to learn from
        |   a `/from-run` start stands it in: skipped `provided-run`, and the run is never re-run
        |   output: the whole run
        v
  [known]   no pipeline, and no model call
        |   its own confirmed findings and judged criteria become the probes — a defect in words and
        |   a situation in words are already the two registers the store indexes
        |   searched for knowledge and lessons only, never this run's own points
        |   output: up to 12 already-known items, fused by reciprocal rank
        |   skips : upstream-skipped | embeddings-disabled | store-unavailable | store-empty
        |           nothing-to-digest | no-probes
        v
  [digest]  runs the knowledge-digest pipeline — and deliberately does NOT need `known`
        |   the record is the engine's reduction of the run plus what is known, the source
        |   pipeline's dimension map, and the artifact's own place ids
        |   output: typed items, and what each claims about what is stored
        |   completes with no output: not-accepted | no-rubric | no-artifact | no-items
        |   skips : source-pipeline-unknown (the source pipeline is no longer registered)
        v
  [store]   no pipeline — writes vectors and rows
            one point per item, one per confirmed finding of the judged iteration
            an item that confirms a known one is a ROW, not a second point
            fails: embedding-failed | store-unavailable | support-unavailable
```

Its reasons are `embeddings-disabled`, `store-unavailable`, `store-empty`, `embedding-failed`,
`support-unavailable`, `not-accepted`, `no-rubric`, `no-artifact`, `nothing-to-digest`, `no-probes`,
`no-items`, `source-pipeline-unknown`. The admission three mean what they mean everywhere: a verdict,
or a child that was never judged.

### The three things worth knowing about it

**`known` costs no model call.** A recall for a goal needs one, because a problem statement has to be
decomposed into the conditions it puts an answer in. This asks about evidence the engine has already
decomposed, so the probes are the evidence itself. It never reads the run's own points, because on a
second pass they would come back as "already known" and the digest would confirm itself.

**A store it cannot search costs the delta, not the learning.** `digest` needs only `target`. With an
empty or unreachable store the step skips, the digest runs with nothing known, and the run still
learns — which is what every digest did before there was a store.

**An item that confirms is reinforcement, not a point.** Its claim becomes a row keyed by (point,
source run), pinned to the text it was made about, and the count a search reads is recomputed from
those rows. Rows rather than a counter because a run digested twice has to count once. This is the
answer to a measured problem: at 386 stored chunks there were 7 lesson pairs above 0.80 cosine and 2
above 0.90, all of them the same brief coached again — where at 145 chunks nothing passed 0.80.

### What a run of it looks like

Learning from a `system-design` run, with nothing stored yet:

```text
target    skipped    provided-run
known     skipped    store-empty
digest    complete   items 1 · kept 1 · confirming 0
store     complete   items 1 · findings 1 · chunks 2 · confirms 0
```

Nothing is wrong here. The store had nothing to compare against, so the digest wrote what the run
taught and the run still learned: one typed item, and one chunk for the confirmed finding the digest's
cap could not have held. Learning from the same run again replaces its own points and rows and leaves
the counts as they were.

## 5. `router` — let the registry pick the judge

**Use it when** you have a brief and do not want to decide which judge grades it.

### What a judge is, and how many there are

A **judge** is not a separate kind of thing. It is just a registered pipeline that takes a brief —
the same pipeline you could have named yourself on `POST /runs`. The word only means "a candidate
the router may dispatch to".

So the list of judges is not written anywhere. It is computed, each time a router run opens, as
every registered pipeline whose `goalSource` is `brief`. Today that is exactly two:

| Judge            | What it grades, in its own words                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `system-design`  | A structured system-design answer to a markdown prompt, judged for coverage, soundness and scale.                                                       |
| `agentic-design` | A design for a workflow of agents, tools and rules, judged for coverage, the fit between its parts, and whether it holds for inputs nobody anticipated. |

The other four are composed-goal pipelines, so they are not candidates and cannot be: handing one a
human prompt would produce a confident reading of something that was never there.

### The registry, and why nothing registers with the router

The registry is one file, `packages/quality-loop/src/pipelines/index.ts`, and it is 24 lines
including the comment. This is all of it:

```ts
import { AGENTIC_DESIGN } from './agentic-design/definition';
import { DESIGN_PROMPT } from './design-prompt/definition';
// … four more imports

const declared: PipelineDefinition<unknown>[] = [
  SYSTEM_DESIGN as PipelineDefinition<unknown>,
  AGENTIC_DESIGN as PipelineDefinition<unknown>,
  MEMORY_RECALL as PipelineDefinition<unknown>,
  EXPERIENCE_DIGEST as PipelineDefinition<unknown>,
  SYSTEM_DESIGN_CANVAS as PipelineDefinition<unknown>,
  DESIGN_PROMPT as PipelineDefinition<unknown>,
];

export const PIPELINES: ReadonlyMap<string, PipelineDefinition<unknown>> = new Map(
  declared.map((definition) => [definition.id, definition]),
);
```

Its own header states the bargain: _"Adding a pipeline is a folder beside `system-design` and one
line here; the core never changes."_ There is no router list, no routes table, no annotation marking
a pipeline as routable. There is this array and nothing else.

Here is the whole path from that array to the words the model reads. Five hops, no branch on any
pipeline's id anywhere along it:

```text
pipelines/index.ts          PIPELINES — the array above, keyed by id
      |
      v
runs/pipelines.module.ts    provided as PIPELINES_TOKEN
      |
      v
runs.service.ts             pipelines() maps describePipeline over it
      |                     -> PipelineSummary[], each carrying { id, description, goalSource, … }
      v
runner/run-orchestration    the summaries are read once when the run opens -> ctx.registry
      |
      v
orchestrators/common.ts     briefRoutes(ctx.registry)
      |                     = registry.filter(goalSource === 'brief')
      |                              .map({ id, description })
      v
llm-brief-classifier.ts     renderRoutes -> `- ${id}: ${description}` , one per line
                            and that string is the "## Judges" block in the prompt
```

So **the sentence the model reads is the pipeline's own `description` field**, carried untouched
from the definition to the prompt. In `system-design/definition.ts` it is written once:

```ts
description:
  'A structured system-design answer to a markdown prompt, judged for coverage, soundness and scale.',
```

and that exact string is the line the classifier weighs. Which means a new judge needs no router
change at all: write the folder, declare `goalSource: 'brief'`, write one honest sentence of
`description`, add one line to the array. It is a route on the next boot, and the sentence you wrote
is how it argues for itself.

The same registry is what the summary endpoint serves, what an orchestrator's declared pipelines are
checked against, and what `pipelinesOf` resolves — so there is exactly one answer in the process to
"which pipelines exist", and the router is simply one of its readers.

### How the router decides

One structured model call, and the model is given exactly two things: the judges, and the brief.

```text
## Judges
- system-design: A structured system-design answer to a markdown prompt, judged for
  coverage, soundness and scale.
- agentic-design: A design for a workflow of agents, tools and rules, judged for
  coverage, the fit between its parts, and whether it holds for inputs nobody
  anticipated.

## Brief
# Design a flash-sale seat reservation service
...
```

Three things constrain the answer, and they are worth separating because only one of them is a
prompt.

- **The schema.** The reply must be one of the ids just listed, because the response schema is an
  enumeration built from those ids. The model cannot name a judge that does not exist, cannot name
  two, and cannot invent one — not as a matter of instruction but because no other answer parses.
  It must also give one sentence of rationale, capped at 400 characters.
- **The instruction.** The persona tells it to decide from what an answer would have to be: the
  thing being designed, what it must do, what its constraints and properties are about. It is told
  explicitly never to decide from formatting, headings, labels, length, or a word in a title, and to
  read the whole brief because the sentence that settles it is often not at the top. Where more than
  one judge could grade it, it picks the one whose description names what the brief's constraints are
  about.
- **What it is not given.** No examples, no scores, no history, no file names. Just the descriptions
  and the brief, which is why a judge's `description` is load-bearing rather than decorative.

If the model answers nothing usable the step fails `unclassified`, and if no registered pipeline
takes a brief it fails `no-routes` before the model is called at all. Neither guesses.

The routes are never hardcoded: they are computed at run time as every registered pipeline whose
`goalSource` is `brief`, so registering a new brief-taking pipeline makes it a route the same day.

```text
  POST /orchestrations/router  { goal }      naming a pipeline here is a 400
        |
        v
  [classify]  no pipeline — one structured model call
        |     routes = every registered pipeline taking a brief, with its description
        |     the model's choices are locked to those ids
        |     output: { pipeline } · note: the model's one-sentence rationale
        |     fails: no-routes | unclassified
        v
  [judge]     runs whichever pipeline classify named
              the declaration names no pipeline — it is a chooser read at run time
              output: the child quality run
```

Its own reasons are `no-routes` and `unclassified`. A failing `judge` fails the whole orchestration,
because dispatch is the deliverable.

### A real routed orchestration run

```text
classify  complete  routes 2
          note: "The brief asks for a seat-reservation service with concurrency spikes, hold
                 expiry, p99 latency targets and a shared relational inventory database —
                 classic distributed-systems coverage, soundness and scale concerns, not a
                 workflow of agents, tools and rules."
judge     complete  iterations 1 · overall 76.5   (ran system-design)
```

Two routes were on offer, the classifier picked `system-design` and said why in one sentence, and the
judge scored the brief 76.5. The rationale is kept as the step's `note` because it is the only part
of a routing decision a human needs to audit.

If you want the decision without the judging quality run, `POST /router/report` does the classification and stops.
Same routes, same classifier, no child quality run, no cost beyond the one call.

## 6. `calibration` — would I get this number again?

**Use it when** you are about to trust a single quality run's score. It runs the same brief through the same
pipeline N times and reports the spread. Everything varies: the producer writes a different artifact
each time, and the judges judge a different artifact each time.

```text
  POST /orchestrations/calibration  { pipeline, goal, samples: N }
        |
        v
  [panel]  N complete runs of the SAME pipeline on the SAME brief
        |  sequential on purpose — each sample is a whole run on one model login
        |  each sample writes its own artifact
        |  output: the completed runs
        |  complete but flagged: sample-failed    fails: run-failed (none completed)
        v
  [reconcile]  no pipeline, no model
               alignment: produced
               spreads for overall, every dimension, iterations; decision and gate tallies
               finding KEYS are never compared
```

Its own reasons are `sample-failed` and `too-few-runs`.

### A real calibration

Two samples of `system-design` on the seat-reservation brief, 587 seconds:

```text
panel      complete  lenses 1 · samples 2 · completed 2 · failed 0
reconcile  complete  runs 2 · overallRange 0.7 · contestedFindings 0 · decisions accept x2

  overall             83.7 .. 84.4   range  0.7
  completeness       100.0 ..100.0   range  0.0
  compliance         100.0 ..100.0   range  0.0
  quality_attributes  77.6 .. 83.3   range  5.7
  soundness           43.4 .. 55.8   range 12.4
```

The headline is reassuring and the detail is not. The overall score moved by 0.7 across the two quality runs, so
the number looks stable. But `soundness` moved by 12.4 on the same brief. The aggregate is steady
because the dimension that wobbles carries only a fifth of the weight. That is the finding a single quality run can never give you, and it is the reason this orchestrator exists.

`contestedFindings` is 0 and always will be here. Under `produced` alignment the reconcile does not
compare findings at key level at all — the samples hold no artifact in common, so a shared key would
mean nothing.

## 7. `second-opinion` — do the judges agree?

**Use it when** an artifact already exists and the question is about the judges rather than the
writer. One artifact is held fixed and judged again by fresh panels. The producer never runs, so the
only thing that varies is judgement.

```text
  POST /orchestrations/second-opinion/from-run  { runId, samples: N }
        |                                        the id travels in the body
        v
  [first]  skipped "provided-run" — the recorded quality run becomes run 0, free
        |  (started without /from-run, it instead runs the target once to make an artifact)
        |  output: that run
        v
  [panel]  N more runs of the same pipeline over THAT ONE artifact
        |  the producer is skipped; every panel reads identical text
        |  skips: no-artifact (the crowned iteration holds none)
        v
  [reconcile]  alignment: provided
               everything calibration reports, PLUS per-finding-key agreement,
               because every run read the same artifact
```

Its own reasons are `sample-failed`, `too-few-runs` and `no-artifact`.

### A real second opinion

A recorded quality run plus two fresh panel quality runs, 441 seconds:

```text
first      skipped   reason provided-run        (the recorded quality run, as run 0)
panel      complete  lenses 1 · samples 2 · completed 2 · failed 0
reconcile  complete  runs 3 · overallRange 4.3 · contestedTypes 3 · contestedFindings 37
           decision contested: false

  contested findings carry the runs that saw them, e.g.
    bad_assumption | assumption.2, capacity.4, tradeoff.6     seenBy [0, 2]
    contradiction  | component.1, flow.6, risk.5              seenBy [0]
    contradiction  | flow.2, flow.3, tradeoff.4               seenBy [1]
```

Three quality runs read one identical artifact. They landed within 4.3 points of each other and all reached
the same decision — so the verdict is solid. Yet **37 individual findings were seen by some panels
and not others**, and `seenBy [0]` means only the original recorded quality run ever raised that one.

That is the useful result: the score is reproducible while the reasoning behind it is not especially.
Judges converge on the grade and diverge on the details. You would never see this from one quality run, and calibration cannot show it either.

## 8. Choosing between the two panels

They look alike and answer different questions. The difference is one declared word in the reconcile
step.

|                          | `calibration`                  | `second-opinion`                    |
| ------------------------ | ------------------------------ | ----------------------------------- |
| What varies              | producer **and** judges        | judges only                         |
| Artifact                 | a new one per sample           | one, held fixed                     |
| Child runs for N samples | N                              | N, plus 1 if not started from a run |
| Alignment                | `produced`                     | `provided`                          |
| Can compare finding keys | no                             | yes                                 |
| Answers                  | would I get this number again? | do the judges agree on why?         |

Across the three recorded orchestration runs of each, the pattern holds exactly: every calibration reports zero
contested findings, and every second opinion reports between 20 and 37 of them.

Run calibration first to learn whether the number is stable. If it is not, run a second opinion on
one artifact to learn whether the instability is the writer or the judges.

## 9. When things go wrong

The record is designed so that a half-hour orchestration never goes silent. Three shapes to
recognise:

**A step skipped for an upstream.** The runner looked at the step's `needs`, found one with no
output, and skipped with `upstream-skipped` (or `upstream-failed`) naming the blocker in `note`. A
step that _completed_ but published nothing still blocks what needs it — that is the `store` skip in
the degraded memory trace above.

**The service died while an orchestration run was in flight.** The janitor reclaims the row, and the record explains every step. From
a real failed record:

```text
status  failed      error: Interrupted — "the service restarted while the memory run was in flight"
recall  complete
target  failed      reason interrupted
digest  skipped     reason interrupted
store   skipped     reason interrupted
```

The running step becomes `failed`, every pending step becomes `skipped`, and anything already settled
is left exactly as it was. A stale row is only reclaimed when no child quality run is still heartbeating, so a slow quality run is not mistaken for a dead one.

**A step gave a reason it never declared.** The runner replaces the result with `errored` and drops
the step's output. The reason vocabulary is closed on purpose: a step cannot invent an explanation
that no reader of the record will understand.

## 10. Running them

```bash
# the service; it refuses to boot without a Claude Code subscription login
pnpm quality-loop:serve

# which judge would grade this brief — classifies, runs nothing
curl -s -X POST localhost:3003/router/report \
  -H 'content-type: application/json' -d '{"goal":"# Prompt ..."}'

# route it for real: classify, then judge once with whichever judge was chosen
curl -s -X POST localhost:3003/orchestrations/router \
  -H 'content-type: application/json' -d '{"goal":"# Prompt ..."}'

# a run that remembers, and contributes back
curl -s -X POST localhost:3003/orchestrations/memory \
  -H 'content-type: application/json' \
  -d '{"pipeline":"system-design","goal":"# Prompt ...","maxIterations":1}'

# is this number stable: the same brief three times, then the spread
curl -s -X POST localhost:3003/orchestrations/calibration \
  -H 'content-type: application/json' \
  -d '{"pipeline":"agentic-design","goal":"# Prompt ...","samples":3,"maxIterations":1}'

# do the judges agree: three fresh panels over one recorded artifact
curl -s -X POST localhost:3003/orchestrations/second-opinion/from-run \
  -H 'content-type: application/json' -d '{"runId":"<a finished run id>","samples":3}'
```

Each POST answers 202 with an id. Read the result back, steps in declared order, with:

```bash
curl -s localhost:3003/orchestrations/<orchestrationRunId>
curl -s 'localhost:3003/orchestrations?orchestrator=memory&status=complete'
```

Omitting `samples` is not the same as passing nothing: the panels fall back to three, but the record
stores `samples: null`, so it will not tell you how many actually ran.
