# The practice workspace: tabs and how grading works

A plain-language guide to the practice screen — what each dock tab is for, how
the Brief and Narrative differ, and what the grader actually reads. For the
engineering detail behind the grade, see
[`pipeline-best-practices/quality-loop.md`](./pipeline-best-practices/quality-loop.md)
and the canvas pipeline itself,
`packages/quality-loop/src/pipelines/system-design-canvas/`.

## The six tabs

The tabs split into three jobs: **read the challenge**, **author your answer**,
and **see results / iterate**.

### Read the challenge

- **Prompt** — the challenge, read-only: its markdown as written, and its
  **criteria** as chips grouped by kind — functional, non-functional, scale,
  constraint — each with an id (`c1`, `c2`, …) and the statement the grader
  derived from the text. The criteria are derived once, the first time the
  prompt is opened ("normalising requirements…" while the grader answers), and
  stay fixed for the prompt's life; they can be re-derived until a session has
  been graded against them. This is _what you're asked to design_; you never
  edit it here.

### Author your answer (these, plus the canvas, are your submission)

- **Brief** — the _structured_ explanation. One row per criterion: the
  **components** that hold it (any nodes on the canvas), a **claim** in your
  own words, and — where a request travels — a **traced path** of connected
  edges. A row is `bound` once it has a claim and at least one component;
  nothing else is checked here. Whether the claim holds is the grader's call.
- **Narrative** — the _prose_ walkthrough: an **overview**, a **rationale per
  component**, and a **narration per criterion**, keyed to the node and
  criterion they explain.

### See results / iterate

- **Feedback** — the graded result of the current revision, straight from the
  quality loop: the **overall score** and the controller's **decision**
  (accept / revise / retry / escalate / reject), one **meter per dimension**
  the pipeline declares (coverage, quality attributes, compliance — "Not
  assessed" when nothing earned it), a **result per criterion** (pass /
  partial / fail), and the **findings**: each with its severity, the lenses
  that confirmed it, its type, the criteria it names, the lens's rationale,
  and the components it points at — click one and they highlight on the
  canvas. While the run is in flight the tab polls; without a model it says so.
- **Coach** — hand the current draft to the loop with a number of iterations.
  The draft is stored as your revision; progress shows the model calls as they
  happen; every iteration that scored strictly higher than all before it
  arrives in the timeline as an **AI** revision, and **Load best** puts it on
  the canvas read-only. Disabled, with the reason, when no model is available.
- **Revisions** — the version history: one chip per revision, newest first,
  with its score, decision and status, and an **AI** badge on coach-authored
  ones. Click a chip to load that revision onto the canvas read-only.

_(Above the canvas, the toolbar holds the actions: **Submit for evaluation**,
**Clear**, **Fit view** and **Export** — a zip of the diagram PDF plus
per-artifact Markdown.)_

## The Properties panel

Select a block and the panel shows, in order: **Kind** (grouped by category,
with a one-line guide: what the kind is and when to use it), **Label**,
**Configuration**, **Responsibilities** and **Operations**. Select an edge and
it shows the edge's **kind** (sync or async), a label, and what it **carries**.

- **Configuration** is free-form: any key, with a value typed as you enter it
  — `true`/`false` become flags, a number stays a number, anything else is
  text. There is no vocabulary to learn; the grader reads whatever you wrote,
  and a critic will say when a value contradicts a claim.
- **Operations** are the component's declared interface — a name, a kind
  (command, query, event, stream), whether it is idempotent, a note. An edge
  may **carry** any operation declared on either of its endpoints; the panel
  offers exactly those.

## Brief vs Narrative

They explain the **same** design in two different forms:

|         | **Brief**                                                              | **Narrative**                                                    |
| ------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Form    | **structured** (a row per criterion)                                   | **prose** (sentences)                                            |
| Answers | _Which_ components hold each criterion, and the _path_ a request takes | _Why_ each component is there, and _how_ each requirement is met |
| Made of | claim + components + traced path, per criterion                        | overview + rationale per component + narration per criterion     |

Both point at the same anchors — the canvas's node and edge ids, the prompt's
criterion ids — and one critic, the explanation critic, reads them against the
diagram. Think of it as a **labelled legend** (Brief) versus the **spoken
walkthrough** (Narrative).

## What the grader reads

You author three things; the prompt's criteria are the answer key it's all
measured against:

| Input                | What's in it                                                                             | Read by                                                                |
| -------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Diagram** (canvas) | nodes (kind, config, responsibilities, operations) + edges (sync/async, what they carry) | every lens — requirements, architecture, capacity, scenarios           |
| **Brief**            | a claim, components and a path per criterion                                             | the explanation critic; both evaluators, as the evidence for a pass    |
| **Narrative**        | overview + rationales + narrations                                                       | the explanation critic                                                 |
| **Prompt**           | its markdown and its criteria                                                            | the goal every lens reads, and the rubric the evaluators grade against |

Two rules keep the grade honest:

- **Explanation earns coverage.** A functional criterion passes only through a
  binding whose path the diagram actually contains; a claim the diagram does
  not back, a load-bearing component nobody explains, and a narration that
  contradicts the drawing are findings priced onto the same dimension the
  criterion earned on. You can't talk your way to a score the design doesn't
  support — and a box with the right label and no story is worth as much as no
  box.
- **The model never picks the number.** Every lens answers in a schema of
  categories and ordinals (severity, confidence, pass / partial / fail) locked
  to the ids on the page; two independent samples must agree before an item
  counts; the deterministic controller prices what they agreed on and decides.

## How the score is built

The canvas pipeline's policy — in
`packages/quality-loop/src/pipelines/system-design-canvas/definition.ts`, data
the engine validates at boot — says how:

1. **Each criterion is judged** pass, partial or fail by the evaluator that
   owns its kind (functional and constraint → the requirements evaluator;
   non-functional and scale → the quality evaluator), weighted by confidence.
2. **Each dimension is earned by its criteria** — functional criteria earn
   `coverage`, non-functional and scale earn `quality_attributes` (scale at
   half weight), constraints earn `compliance` — then **confirmed findings
   subtract**: a priced penalty per severity, decaying with each further
   finding on the same dimension, clamped at a per-dimension cap.
3. **Overall is the weighted average** of the assessed dimensions
   (`coverage` 0.4, `quality_attributes` 0.4, `compliance` 0.2); a dimension
   nothing earned drops out and the rest rescale.
4. **Gates come before the number.** A `critical` finding, a confirmed
   constraint violation or a failed constraint criterion blocks an accept
   however high the score; at or above the accept threshold the decision is
   `accept`, below the reject floor `retry`, and in between `revise` with the
   remediations the coach would apply.

There is no letter grade and no cap the studio adds: what you see is the
loop's decision and its trace.
