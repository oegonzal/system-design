# The four orchestrators, and how to read what they did

A single quality run answers one question: is this artifact any good? An orchestrator answers questions that need several quality runs — _does this answer get better if it remembers what earlier quality runs learned_, _which
judge does this brief belong to_, _would I get this score again_, _do the judges even agree_.

This page covers what each of the four is for, how its steps actually work, and what a real recorded orchestration run looks like. Every trace below is a real row from the local database, not an invention.

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
- A chunk from a run that ended rejected or escalated may inform a risk, never a
  recommendation.

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
  limit. The goal is therefore both the prompt and the contract it will be checked against.
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

## 2. The reasons, and who writes them

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

## 3. `memory` — give a quality run the lessons of earlier runs

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
        |   completes with no output: not-accepted | no-rubric | no-artifact | no-memories
        v
  [store]   no pipeline — writes to the vector store
            one chunk per memory, two vectors each (its condition, its lesson)
            skips: upstream-skipped | store-unavailable
```

Its own reasons are `embeddings-disabled`, `store-unavailable`, `store-empty`, `embedding-failed`,
`not-accepted`, `no-rubric`, `no-artifact`, `no-usable-memory`, `goal-at-budget`,
`nothing-to-digest`, `no-memories`. The middle three are the engine's `admission` in the
orchestrator's words: `not-accepted` is a verdict (judged, and short of the bar or a gate);
`no-rubric` and `no-artifact` mean the child was never judged, and are kept apart so a
deriver's schema miss is never read as a digest that fell short.

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

## 4. `router` — let the registry pick the judge

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

## 5. `calibration` — would I get this number again?

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

## 6. `second-opinion` — do the judges agree?

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

## 7. Choosing between the two panels

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

## 8. When things go wrong

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

## 9. Running them

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
