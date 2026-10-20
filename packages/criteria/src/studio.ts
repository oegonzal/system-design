import type { Criterion } from './criterion';

/**
 * The System Design Studio (packages/studio-ui, packages/studio-api).
 */
export const STUDIO_CRITERIA: readonly Criterion[] = [
  // Interactive design canvas
  { id: 'UX-1', statement: 'The palette offers every system-design node kind in the contract.' },
  { id: 'UX-2', statement: 'Nodes can be added, connected, edited and deleted on the canvas.' },
  { id: 'UX-3', statement: 'Edges distinguish sync from async communication.' },
  {
    id: 'UX-4',
    statement: 'Palette blocks are grouped into visible categories and filterable by name.',
  },
  {
    id: 'UX-5',
    statement:
      'Components declare operations and responsibilities, and a connection carries an operation declared on either of its endpoints.',
  },
  {
    id: 'UX-6',
    statement:
      "A design brief binds each of the prompt's criteria to the components that hold it — with a claim in the author's words and, where a request travels, a traced path of edges — and is submitted with the diagram.",
  },
  {
    id: 'UX-7',
    statement: 'Every block kind teaches what it is for and when to use it in the UI.',
  },
  {
    id: 'UX-8',
    statement:
      'The walkthrough is authored as reference-anchored slots — an overview, a rationale per component, a narration per criterion — and submitted with the diagram for the grader to read.',
  },
  {
    id: 'UX-9',
    statement:
      "A component's configuration is free-form: any key with a text, number or flag value, typed as the author enters it, with no vocabulary the editor must know.",
  },
  {
    id: 'UX-10',
    statement:
      'A run exports in one click as a single zip — the diagram as a PDF plus prompt, narrative, brief, feedback and revisions each as its own Markdown file — so a design survives outside the database.',
  },
  {
    id: 'UX-11',
    statement:
      'A stuck author can hand the design to the AI coach: the coach is a revise run of the grader, its progress shows live, every iteration that beat the ones before it loads back from the timeline marked with its assistant origin, and without a live model the control explains itself instead of failing.',
  },
  {
    id: 'UX-12',
    statement:
      'A practice URL for a session that no longer exists shows a graceful not-found with a way back to the dashboard, never a raw server error; a transient load failure offers a retry instead.',
  },
  {
    id: 'UX-13',
    statement:
      "A detail page names the browser tab after what it shows — a prompt's or a story's own title — also when it is opened at its own address; and an in-app navigation away from unsaved words, the browser's Back included, asks first and leaves only when allowed.",
  },
  // Prompt generation from experience
  {
    id: 'GEN-1',
    statement:
      "A design prompt can be generated from an experience — the named one, or the least practised in fixture order, an example written for practice as any other — by the grader's prompt pipeline, from a goal rendering the experience whole with its practice lines as the last of its highlights: the run is started, polled, and its best draft claimed once into a prompt marked generated whose rubric is the draft's own rows, one criterion each, never a second derivation.",
  },
  {
    id: 'GEN-2',
    statement:
      'A prompt can be written by hand as markdown and is stored verbatim with the rubric the grader derives from it.',
  },
  {
    id: 'GEN-3',
    statement:
      "A prompt can be imported from the grader's library and is stored with the rubric the grader derives from it.",
  },
  // Critic / eval pipeline
  {
    id: 'EVAL-1',
    statement:
      "A submitted revision is graded by the quality loop: the feedback shows the run's overall score, decision, one meter per dimension the pipeline declares, and a result per criterion.",
  },
  {
    id: 'EVAL-2',
    statement:
      "Findings teach: each carries the lens's rationale and is grounded onto the canvas — the nodes and edges it names highlight when selected.",
  },
  {
    id: 'EVAL-3',
    statement:
      'A design improved along a finding, resubmitted, is graded higher, and the timeline shows the rising trend.',
  },
  {
    id: 'EVAL-4',
    statement:
      'A design is graded as competencies — coverage, design, qualities, reasoning, compliance — each earned by the criterion kinds a prompt’s rubric states, scale one kind among ten weighted only by the figures the prompt gives it, every finding type owned by one critic and priced where that critic’s kinds earn, and two standing trade-off criteria closing every rubric so reasoning is earnable on every prompt.',
  },
  {
    id: 'UX-14',
    statement:
      'A prompt shows its markdown rendered and its criteria as chips grouped by kind; a written or imported prompt’s criteria are derived once by the grader, shown as normalising until they arrive, and can be re-derived until a session has been started on them — every read says when that has locked them — while a generated prompt’s are its draft’s and are never re-derived; a rewrite derives once and makes the prompt authored; a session whose prompt was archived still reads but takes no submit and no coach until the prompt is back.',
  },
  {
    id: 'UX-15',
    statement:
      'The unsubmitted canvas is a draft kept with the session: it autosaves shape-checked only, is restored ahead of the latest revision when the workspace opens, is cleared by the submit or coach start it became, and the workspace asks before a pending save is lost.',
  },
  {
    id: 'UX-16',
    statement:
      'Canvas edits undo and redo step by step, from the toolbar and the keyboard — a typed field, a drag, a delete with its connections, a Clear each one step — and a revision on screen is read-only in every control: nothing on the canvas, the palette, the properties or the toolbar edits it.',
  },
  {
    id: 'UX-17',
    statement:
      'A failed grade is re-graded in place: the same revision is pointed at a fresh run of its stored design — never a second revision with the same content — only when it has no grade to keep (its run failed, the grader lost it, or it never had one), under the rules a submit obeys, and the draft is left alone.',
  },
  {
    id: 'UX-18',
    statement:
      'A grade the loop judged on too little evidence for a verdict is not a score: it is reported unassessed — no overall, no dimension values, no criterion rationale presented as a verdict — distinct from a real 0, is re-graded in place like a failed grade, and is refused as the coach’s starting point with words that say why.',
  },
  {
    id: 'UX-19',
    statement:
      'A text field bounded by a declared bound asks for its target and takes up to its ceiling: the count runs down to the target, then says how far over the ask the value runs and how much the field takes at most, and the field stops — and says so — only at the ceiling; every studio editor of a bounded value passes both, while an exact id keeps its one max.',
  },
  {
    id: 'UX-20',
    statement:
      'A coach revision imports whatever it wrote: a field past what was asked, or past what a submit accepts, is stored whole with its overruns logged on the import, and only a shape that is no submission is refused; restored as the draft it re-saves as written — a draft save refuses only a fault of shape, in the one issue shape — while a submit stays held to the ceilings.',
  },
  {
    id: 'UX-21',
    statement:
      "The studio says where a grade or a lesson stands without the loop's private words: a session card whose latest grade's run failed reads grading failed, beside not assessed for one that judged too little, and neither shows a score or a decision; and each lesson the coach was handed says where it helps in the prompt's own criteria and defects — nothing when it names none — and where it was learned: the iteration of an earlier run of which kind of work, how that iteration was decided, and the day, when the record carries them.",
  },
  {
    id: 'UX-22',
    statement:
      'A text field holding a value past its ceiling — set from code, as a coach revision imported whole is, and refused by a submit — shows it whole and never cuts it: its count says how far past the most the field accepts the value runs and that it must be shortened to submit, and the field announces that once, until it is shortened.',
  },
  {
    id: 'UX-24',
    statement:
      'A design carries a data model beside its diagram — entities with their owner node, key, fields, invariants and lifecycle states, and the relations between them — and a list of the assumptions it depends on; a binding may name the entities that hold a criterion beside the nodes; the model is its own tab, kept as typed in a draft, trimmed and reference-checked on submit, printed for the graders as entity lines and in the export as model.md, and never required: a revision stored before models existed reads as none submitted.',
  },
  {
    id: 'UX-23',
    statement:
      'Trade-offs are written where the claims are and graded there: every binding offers why this mechanism and not another, every component rationale an instead-of, and the narrative a list of the decisions the design rests on — choice, alternative, cost, what would change it, the components concerned — kept as typed in a draft, trimmed and reference-checked on submit, printed for the graders and in the export, and never required by a validator, because an undefended choice is the grader’s lesson, not a refused save.',
  },
  // STAR repository
  {
    id: 'STAR-1',
    statement:
      'STAR stories support create, read, update and delete; a story is saved only with a title and all four sections filled and its tags bounded, by one rule the API and the form share.',
  },
  { id: 'STAR-2', statement: 'Stories are searchable and filterable by tag.' },
  { id: 'STAR-3', statement: 'A story can link to a prompt and an experience.' },
  // Grading delegated to the quality loop
  {
    id: 'DEL-1',
    statement:
      "Grading is delegated: a submission is one system-design-canvas run started on the prompt's fixed criteria before the revision row is written, and the row points at the run's iteration that judged it.",
  },
  {
    id: 'DEL-2',
    statement:
      "A prompt is markdown plus criteria derived once through the grader's derive stage; the ids are stable for the prompt's life, so a brief written against c3 still means c3 on the next revision.",
  },
  {
    id: 'DEL-3',
    statement:
      "The coach is a revise run recorded on its session: it starts from the draft, stored as the author's revision, or from a graded revision whose recorded grade the loop adopts verbatim; every iteration that beat the ones before it is imported once, as soon as the loop has recorded it, as an assistant revision with its own grade; one the studio would refuse is reported refused with its problems and never stored, one with no artifact is reported as such, unscored, and one whose revision the lenses assessed too little is reported unassessed — compared with nothing, never “not better”; while the run is in flight the session takes no submit and no second coach, and says so.",
  },
  {
    id: 'DEL-4',
    statement:
      "The grade the studio shows is the run's, read for one iteration and grounded by position onto the graded graph; the studio invents no score, decision or dimension, says which lens samples answered nothing, gives a stop reason only to the iteration that ended a run that could revise — never to a plain grade, which always ends on its one iteration, and never when the decision already says it — and caches only the terminal scalars.",
  },
  {
    id: 'DEL-5',
    statement:
      'The studio validates structure only — references that cannot resolve — and every problem at once; whether a design is any good is never decided by the studio.',
  },
  {
    id: 'DEL-6',
    statement:
      'Three prompt sources — authored, imported, generated — yield one shape, and a grader that cannot derive a rubric answers 503 with its diagnostic and model report rather than an invented one.',
  },
  {
    id: 'DEL-7',
    statement:
      'One zod schema defines a design submission for every side: the studio API validates with it, the canvas pipeline declares its artifact with it, and the canvas UI types its store from it.',
  },
  {
    id: 'DEL-8',
    statement:
      "What settled a grade's decision reaches the studio as data — the controller step that decided, what it decided on (the score and the threshold or floor it was held to, the blockers it named), how many remediations it selected, how many of the criteria were assessed — so the decision is worded where it is read rather than shown as the controller's own sentence.",
  },
];
