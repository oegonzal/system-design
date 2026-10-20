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

Every prompt carries a **practice format** (`PRACTICE_FORMATS` in contracts):
the whole system, or one competency practised on its own — domain model and
API, boundaries and modules, workflows and failure handling, evolution and
migration. The format shows beside the prompt's source, says what the graders
lean on, and is what the prompt writer drafts toward when a prompt is
generated. It is data on the prompt; nothing in the studio branches on it.

- **Prompt** — the challenge, read-only: its markdown rendered (tables and
  lists as written; its headings demoted so the document's own title never
  competes with the page's), and its **criteria** as chips grouped by kind —
  functional, domain model, interface, boundary, workflow, non-functional,
  scale, evolution, trade-off, constraint — each with an id (`c1`, `c2`, …)
  and its statement. Two standing trade-off criteria close every rubric:
  every load-bearing decision records an alternative and its cost, and the
  design's assumptions are stated. For a written or imported prompt the criteria
  are derived once by the grader, the first time the prompt is opened
  ("normalising requirements…" while it answers), and can be re-derived until
  a session has been graded against them; a generated prompt's criteria are
  its draft's own rows and are never re-derived. Either way they stay fixed
  for the prompt's life. This is _what you're asked to design_; you never
  edit it here. If the prompt was archived meanwhile, the tab says so, and
  Submit and the coach stay disabled until it is reactivated.

### Author your answer (these, plus the canvas, are your submission)

- **Brief** — the _structured_ explanation. One row per criterion: the
  **components** that hold it (any nodes on the canvas), a **claim** in your
  own words, — where a request travels — a **traced path** of connected
  edges, and **why this, not another**: the mechanism that could have held
  the requirement instead, and the cost of the one chosen. A row is `bound`
  once it has a claim and at least one component; nothing else is checked
  here. Whether the claim holds, and whether the choice is defended, is the
  grader's call.
- **Model** — the _data_ half: the **entities** the design keeps, each with
  the node that **owns** it, its **key**, its **fields**, the **invariants**
  every instance must hold and the **states** it moves through, and the
  **relations** between them. A binding may name the entities that hold a
  criterion beside the nodes. The model critic reads it against your diagram;
  a store that owns nothing and an entity nothing owns are both findings.
- **Narrative** — the _prose_ walkthrough: an **overview**, the
  **assumptions** the design depends on (one sentence each), a **rationale per
  component** with an **instead of** (what could have stood there, and why it
  does not), the **decisions the design rests on** — each a choice, the
  alternative, the cost, and what would change your mind, tied to the
  components it concerns — and a **narration per criterion**, keyed to the
  node and criterion they explain. Trade-offs are a quarter of the grade:
  three standing criteria on every rubric ask that every load-bearing
  decision be defended, that every binding that had a choice say why, and
  that the assumptions be stated.

### See results / iterate

- **Feedback** — the graded result of one revision, straight from the quality
  loop. The tab says first whose feedback it is — **Feedback for revision #2**,
  with an **AI** badge when the coach wrote it — and, once the canvas has moved
  on to the draft (a revision restored as the draft, a session reopened on a
  saved one), **The canvas shows your draft, not this revision.** so a score
  never reads as the verdict on what is drawn now. Then the **overall score**
  with the controller's **decision**
  (accept / revise / retry / escalate / reject) and why, in plain words
  worded from what settled it — **Below the accept threshold — 3 fixes to
  make.**, **Blocked by** the findings and criteria it names, **Below the
  reject floor of 30**, **At or above the accept threshold of 75** — never
  the controller's own sentence, one
  **meter per dimension** the pipeline declares (coverage, design, qualities,
  reasoning, compliance — "Not assessed" when nothing earned it), a **result per
  criterion** (pass / partial / fail, a stacked list), and the **findings**:
  each with its severity, the lenses that confirmed it, its type, the criteria
  it names, the lens's rationale, and the places it points at, **labelled** —
  `api · service · API`, `c1 ← api`, a narration's criterion — with the same
  labels substituted into the rationale; click one and its nodes and edges
  highlight on the canvas. A lens writes positions the way a person would —
  `Rationale.3` at the start of a sentence, `edge.1-2` for a run — and every
  one the revision has is read as its label — and so is a place the
  rationale merely mentions, which reads by its label too but is no chip of
  the finding's and highlights nothing: a finding is where its lens cited.
  A grade made without some of its lens samples says which did not answer
  and that the score stands on the ones that did. A grade whose lenses
  assessed too few of the criteria to score the design is no verdict: in
  place of a score and a decision the tab says **This revision couldn’t be
  graded** — how many of the criteria the lenses assessed, which lens samples
  did not answer, and that nothing there is a verdict on the design — with
  **Grade this revision again**, which grades it again in place as a failed
  grade is.
  While the run is in flight the tab polls and counts how long the grade has
  taken from the run's own start (so a reload or a re-grade counts right),
  and if the run's last sign of life — its heartbeat — has missed two of the
  beats the loop says its runs keep (two minutes at the loop's defaults; the
  pace comes with the grader's availability) it says **The grader has not
  reported for N minutes.** rather than spinning in silence. The heartbeat is
  measured on the server's clock, never the page's, so a machine whose clock
  is off neither raises the warning nor hides it. The loop gives such a run
  up after its stale window and marks it failed, and it can be graded again
  from here. While the
  loop is unreachable the tab says so. A grade that **failed** — the model
  went away, or the loop restarted under it — says **Grading stopped
  unexpectedly** in the author's terms, with the run's own error folded under
  **Technical details**, and is graded again **in place**: the same revision,
  a fresh run, no second copy of the design in the timeline
  (`POST /revisions/:id/evaluation`, refused while a grade is running or
  once one stands). A revision stored before grading moved to the loop, or
  whose run the grader no longer has, has no evaluation; the tab says so and
  offers the same re-grade. A plain grade shows no "stop reason": one
  judgement always ends on its one iteration. Only a coach's last revision
  says why the coach stopped, when it ran out of iterations or of progress.
- **Coach** — hand your design to the loop with a number of iterations. From
  the draft: it is stored as your revision and graded as the starting point.
  From a graded revision — when the canvas is clean and the loaded revision's
  grade is complete — the loop reuses that grade as the starting point instead
  of grading it again, and nothing is stored twice. A revision whose grade was
  not assessed is no starting point — the coach would measure every revision
  against a number that was never a score — so the coach is off and says
  why: grade it again, then coach it. Before the coach revises
  anything, the loop recalls lessons from earlier runs for the prompt — and,
  starting from a graded revision, for what that grade found wrong with it —
  and hands them to the coach only — the graders never see them — so the panel
  first says it is recalling, then **Recalled N lessons from earlier runs for
  the coach** with the list behind **Show lessons** — and, when it started
  from a graded revision, **Searched for what the starting grade found
  wrong:** each kind of defect that grade confirmed and each criterion it fell
  short on (`c3 not met`, `c4 met in part`) — or why there were none — with
  one iteration there is nothing to revise, so the coach recalls none, and a
  review that could not settle what to check the lessons against, or
  produced nothing to go on, says so in its own words. Progress shows the
  iteration under way and the model calls as they happen, how long the run
  has been going from its own start, and — as on the Feedback tab — **The
  grader has not reported for N minutes.** once its heartbeat is stale; the
  newest coaching run is restored when the page reloads. Each row is the
  **starting point** (**grade reused** when the loop adopted a revision's
  grade instead of grading it again), **imported** (it beat every earlier one
  and landed in the timeline as an **AI** revision), **not better**,
  **not assessed** · **not compared** (the lenses could not assess that
  revision, so there was no score to hold against the others),
  **refused** with the problems the studio found, or **no revision
  produced** — the coach's miss, never a verdict on your design — every
  judged row with the controller's decision and why, in the same words as
  the feedback, naming the findings and criteria it cites. A run whose last
  revision could not be assessed says so and stopped there — a miss to try
  again, not a call for a person. A run that fails says
  **The coach stopped unexpectedly** with its own error under **Technical
  details**, and the previous run's best revision stays one click away. An
  imported revision keeps your layout: the
  coach reads the canvas as text and returns no positions, so every block
  that survived stays where you put it and each block the coach added is
  placed beside the blocks it connects to, never on top of one. **Load best**
  puts the best import on the canvas read-only. Disabled, with the reason,
  while the loop is unreachable.
- **Revisions** — the version history: one chip per revision, newest first,
  with its score, decision and status — **grading…** while its run goes,
  **not assessed** in place of a score and a decision when its grade earned
  none, **failed** when the run failed, **grade lost** when the grader no longer
  has the run (the chip's title says so, and the Feedback tab offers the
  re-grade) — and an **AI** badge on coach-authored ones. The chip the
  canvas shows is marked current and says **on canvas**; when the canvas
  shows the draft instead, no chip is current, and the revision whose grade
  the Feedback tab still shows says **feedback shown**. Click a chip to load
  that revision onto the canvas read-only: Submit, Clear and the Brief and
  Narrative editors lock until **Restore as draft** puts it back as your own.

_(Beside the page's title sits the session's status: **submitted #2 ·
graded** — your latest submission, named as that so it never reads as a
label for whatever the canvas shows, with **grading…**, **not assessed** or
**grading failed** in place of **graded** while its grade runs, when it
earned no score, or after it failed. Above the canvas, the toolbar holds
the actions — **Submit for grading**, **Undo**, **Redo**, **Clear**, **Fit
view** and **Export** — and the **draft badge**: unsaved draft, saving
draft…, draft saved, draft not saved. **Export** downloads a zip of the
diagram PDF plus per-artifact Markdown, named for what the diagram is:
`…-rev2.zip` for the revision on the canvas, `…-draft.zip` when the canvas
shows the draft. When that draft has moved on from the revision whose
feedback is shown, the feedback file opens with the panel's own caveat
(**The canvas shows your draft, not this revision. The diagram in this
export is the draft.**), and every file says what the panel says, a grade
that was not assessed included. The canvas autosaves to the session a
moment after you stop editing, is restored ahead of the latest revision when
the workspace opens, and is cleared by the submit or coach start it became;
a navigation while a save is still pending asks first, and a save that finds
the session gone turns the page into its not-found. Blocks are selected one
at a time by a click, several at once by ⌘-click or Ctrl-click; the
Properties panel edits the one last clicked.)_

## Interview mode

A prompt practised as an **interview** adds an Interview tab and hides most of
the prompt: you see its first section, and the Criteria list is empty until the
interviewer's answers disclose criteria one by one. The tab shows the current
phase with a countdown (clarify 10, design 35, deep dive 15 minutes — shown,
never enforced; a phase ends only when you move on, open the deep dive, or
submit), the transcript so far, and one box: write questions one per line and
**Ask**, or **Answer** what you were asked. The interviewer answers from the
whole prompt and nothing else, never proposes a design, and each reply carries
the judges' decision as a badge. **Open the deep dive** asks the interviewer to
probe the criteria your brief has not bound yet; the probes are chosen by rule,
not by a model. Submitting ends the interview: the whole prompt and rubric are
yours beside the grade, the transcript rides on the submission as `turn.N`
lines the graders cite, and the export carries it as `transcript.md`.

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
  (command, query, event, stream), whether it is idempotent, a note. The
  graders and the coach read a note whole, up to the 200 characters the panel
  accepts, so it is the place to state an operation's contract — its retry,
  its ordering, its acknowledgement; the field says so under itself while
  you type, and counts down as the limit nears. An edge may **carry** any
  operation declared on either of its endpoints; the panel offers exactly
  those.

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
| **Diagram** (canvas) | nodes (kind, config, responsibilities, operations) + edges (sync/async, what they carry) | every lens — requirements, model, structure, fitness                   |
| **Model**            | entities (owner, key, fields, invariants, states) and their relations                    | the model critic; the design evaluator                                 |
| **Brief**            | a claim, components, entities and a path per criterion                                   | the explanation critic; every evaluator, as the evidence for a pass    |
| **Narrative**        | overview + rationales + narrations                                                       | the explanation critic; the reasoning evaluator                        |
| **Prompt**           | its markdown and its criteria                                                            | the goal every lens reads, and the rubric the evaluators grade against |

Two rules keep the grade honest:

- **Explanation is graded as reasoning.** A functional criterion passes only
  through a binding whose path the diagram actually contains; a claim the
  diagram does not back, a load-bearing component nobody explains, a narration
  that contradicts the drawing, a choice with no alternative considered and an
  assumption nobody states are findings priced onto `reasoning`, the dimension
  the standing trade-off criteria earn. You can't talk your way to a score the
  design doesn't support — and a box with the right label and no story is
  worth as much as no box.
- **The model never picks the number.** Every lens answers in a schema of
  categories and ordinals (severity, confidence, pass / partial / fail) locked
  to the ids on the page; two independent samples must agree before an item
  counts; the deterministic controller prices what they agreed on and decides.

## How the score is built

The canvas pipeline's policy — in
`packages/quality-loop/src/pipelines/system-design-canvas/definition.ts`, data
the engine validates at boot — says how:

1. **Each criterion is judged** pass, partial or fail by the evaluator that
   owns its kind (functional and constraint → coverage; domain model,
   interface, boundary and workflow → design; non-functional, scale and
   evolution → qualities; trade-off → reasoning), weighted by confidence. An
   evaluator with no criteria of its kinds on a prompt is skipped without a
   call.
2. **Each dimension is earned by its criteria** — every kind at the same
   weight — then **confirmed findings subtract**: a priced penalty per
   severity, decaying with each further finding on the same dimension,
   clamped at a per-dimension cap; a finding prices onto the dimension its
   critic's kinds earn.
3. **Overall is the weighted average** of the assessed dimensions
   (`coverage` 0.25, `design` 0.35, `qualities` 0.2, `reasoning` 0.1,
   `compliance` 0.1); a dimension with no criteria and no findings drops out
   and the rest rescale, which is how a prompt that states no load gives scale
   no weight at all.
4. **Gates come before the number.** A `critical` finding, a confirmed
   constraint violation or a failed constraint criterion blocks an accept
   however high the score; at or above the accept threshold the decision is
   `accept`, and below it `revise` with the remediations the coach would
   apply — below the reject floor as well, where the design needs reworking
   rather than touching up: the canvas pipeline never answers `retry`, since
   a design you drew is revised, never started over.

There is no letter grade and no cap the studio adds: what you see is the
loop's decision and its trace.
