# The practice workspace: tabs and how grading works

A plain-language guide to the practice screen — what each dock tab is for, how
the Brief and Narrative differ, and what the scoring actually reads. For the
engineering detail behind the grade, see
[`critic-eval-pipeline/how-it-works.md`](./critic-eval-pipeline/how-it-works.md).

## The six tabs

The tabs split into three jobs: **read the challenge**, **author your answer**,
and **see results / iterate**.

### Read the challenge

- **Prompt** — the challenge, read-only. The scenario, functional requirements,
  the non-functional requirements (kind · statement · target), scale targets
  (users, RPS, read:write, p99, availability, retention), and — on order-history
  prompts — the business workflow spec. This is _what you're asked to design_;
  you never edit it.

### Author your answer (these, plus the canvas, are your submission)

- **Brief** — the _structured_ explanation, graded. Two parts: **NFR bindings**
  (for each non-functional requirement, pick which components hold it and by what
  mechanism, with a live chip showing whether the diagram actually backs the
  claim) and **traced flows** (for each functional requirement, walk a connected
  path of edges through the design).
- **Narrative** — the _prose_ walkthrough, graded. An **overview**, a
  **rationale per component**, and a **flow narration per requirement**, with
  live checklists of what isn't explained yet.

### See results / iterate

- **Feedback** — the graded result of the current revision: overall **score +
  letter grade** (and any grade cap), **per-dimension scores** (reliability,
  scalability, performance, data, messaging, security, hygiene, explanation,
  product — "Not assessed" when a dimension doesn't apply), a summary, and the
  **findings list** (each with severity, the affected components, and often a
  one-click "Preview fix"). Advisory AI notes appear below the graded result.
- **Coach** — the AI coach's live improvement run. The **trajectory streams in**
  — iteration 0 (your baseline) then each proposal with its score and an
  **accepted / rejected** verdict and a one-line lesson — with a Stop button
  while it runs and **Load improved design** when it finishes. Explains itself if
  no model is available.
- **Revisions** — the version history: one chip per submitted revision, newest
  first, as `#n grade score`, with an **AI** badge on coach-authored revisions.
  Click a chip to load that revision onto the canvas read-only.

_(Above the canvas, the toolbar holds the actions: **Submit for evaluation**,
**Clear**, **Fit view**, **Export** (a zip of the diagram PDF + per-artifact
Markdown), and **Improve with AI**, which starts a Coach run.)_

## Brief vs Narrative

They explain the **same** design in two different forms:

|         | **Brief**                                                                   | **Narrative**                                            |
| ------- | --------------------------------------------------------------------------- | -------------------------------------------------------- |
| Form    | **structured** (references, dropdowns)                                      | **prose** (sentences)                                    |
| Answers | _Which_ component holds each requirement, and the _path_ each request takes | _Why_ each component is there, and _how_ each flow works |
| Made of | NFR bindings + traced flows                                                 | overview + component rationales + flow narrations        |

Both point at the same anchors (node ids, requirement numbers), and both feed the
one **explanation** score — the Brief is the structured half, the Narrative is
the story half. Think of it as a **labelled legend** (Brief) versus the **spoken
walkthrough** (Narrative).

## What the scoring reads

You author three things; the prompt is the answer key it's all measured against:

| Input                | What's in it                                                                                   | Mainly scores                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Diagram** (canvas) | nodes (kind, config knobs, responsibilities, operations) + edges (sync/async, what they carry) | every technical dimension — reliability, scalability, performance, data, messaging, security, hygiene, product |
| **Brief**            | bindings + traced flows                                                                        | explanation (structured)                                                                                       |
| **Narrative**        | overview + component rationales + flow narrations                                              | explanation (prose)                                                                                            |
| **Prompt**           | scale targets, NFRs, functional requirements, workflow spec                                    | the _reference_ everything is judged against — you don't author it                                             |

Two rules keep the grade honest:

- **Grounded in the diagram.** A Brief or Narrative claim only earns points if the
  diagram actually backs it — a binding counts only if those components really
  provide that mechanism. You can't talk your way to a score the design doesn't
  support.
- **No keyword gaming.** Prose is judged by its references plus a "reads-as-prose"
  check, never by matching words. On the default stack the AI critic only adds
  advisory notes and the deterministic engine sets the number. Under the opt-in
  **deep eval** (RUNBOOK: `EVAL_DETERMINISTIC=0`), the critic and workability
  evaluator can also _lower_ the score by finding **grounded weaknesses** —
  each tied to a specific requirement and components, expressed as an ordinal
  magnitude and confidence that the engine turns into a bounded, downward-only
  deduction. The AI still never picks the number and can never trip a letter cap;
  it only supplies grounded evidence for the engine to price.

## How the score is built

Four steps turn your submission into a grade (rubric `default@3.3.0`):

1. **Each dimension gets 0–100, or "Not assessed."** A dimension is _earned_ by
   meeting the prompt's expectations for it, then **violations subtract** points.
   A dimension the prompt never exercises (and that has no violations) is "Not
   assessed" and simply drops out.
2. **Overall = a weighted average of the assessed dimensions.** Dropped
   dimensions don't count; the remaining weights are rescaled to fill the gap, so
   the ratios below always hold among whatever applies.
3. **A letter grade comes from the score:** **A ≥ 92, B ≥ 82, C ≥ 68, D ≥ 50**,
   otherwise F.
4. **Grade caps can lower the letter** — see below.

### The weights (what counts most)

The nine dimensions carry these shares of the final score (they sum to 1.0):

| Dimension       | Weight     | Roughly |
| --------------- | ---------- | ------- |
| **Scalability** | **0.1825** | ~18%    |
| **Explanation** | **0.17**   | ~17%    |
| Reliability     | 0.142      | ~14%    |
| Performance     | 0.1115     | ~11%    |
| Data            | 0.1115     | ~11%    |
| Product\*       | 0.10       | ~10%    |
| Messaging       | 0.071      | ~7%     |
| Security        | 0.071      | ~7%     |
| Hygiene         | 0.0405     | ~4%     |

\* Product only applies to prompts with a business workflow spec (e.g.
order-history); on other prompts it is "Not assessed" and its share is
redistributed.

**Explanation is now a major factor** (~17%, second only to scalability): the two
authoring tabs — Brief and Narrative — share this dimension, so _how well you
explain your design_ is worth nearly a fifth of the grade. A weak or missing
brief/narrative now costs you a lot; a strong one is worth real points. The
technical side still leads — scalability is heaviest and the "does it work at
scale" group (scalability + reliability + performance + data ≈ 55%) is the
largest block — but the explanation is no longer a rounding error.

### What's actually most important: the caps

Two things override the number and cap your **letter grade** no matter how high
the score:

- **A critical finding caps you at C** (two or more → D). One critical
  reliability or data hole means a 95/100 design is still a C.
- **No narrative caps you at C.** A missing or thin walkthrough (`exp.nar.present`
  unmet) can't earn better than C, however good the diagram — this is the
  deterministic teeth behind "the narrative is required."

So in practice: **avoid critical findings and always write a real narrative**
matters more to your final grade than squeezing points anywhere else — and among
the point-scoring dimensions, **scalability and now explanation move the number
the most**, so a well-argued brief and narrative are worth genuinely investing in.

### How violations subtract

Within a dimension, each finding deducts by severity — **critical 35, high 22,
medium 10, low 4, info 0** — and repeats **decay ×0.7** each time, so the first
(worst) finding in a dimension hurts most and a pile-up of minor ones can't sink
it past reason. "info" findings never cost points; they're advice.
