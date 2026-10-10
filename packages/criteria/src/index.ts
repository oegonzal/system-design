/**
 * The product's completion criteria as a typed registry.
 *
 * Tests claim a criterion by putting its id in the title — `it('[EVAL-1] …')`,
 * `test('[UX-2] …')` — which is the one marker both Vitest and Playwright can
 * carry. A coverage spec (tooling) fails when any id below has no test, so a
 * requirement cannot silently lose its proof, and when a test claims an id
 * that is not below, so a proof cannot point at nothing.
 */
export interface Criterion {
  id: string;
  /** What must be demonstrably true. */
  statement: string;
}

export const CRITERIA: readonly Criterion[] = [
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
      "A design prompt can be generated from an experience — the named one, or the least practised in fixture order — by the grader's prompt pipeline: the run is started, polled, and its best draft claimed once into a prompt marked generated whose rubric is the draft's own rows, one criterion each, never a second derivation.",
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
  // Quality-control loop (packages/quality-loop)
  {
    id: 'QL-1',
    statement:
      'A quality-loop pipeline is declared as data — task vocabulary, md lens personas, lens specs and a decision policy — and validated before any run, so a malformed pipeline never runs.',
  },
  {
    id: 'QL-2',
    statement:
      'Success criteria are derived from the goal text by one structured extraction with engine-assigned ids; the goal reaches only prompts, never scoring code.',
  },
  {
    id: 'QL-3',
    statement:
      'Deterministic validators run before any model, each with a declared gate: a block failure skips every lens and yields retry; a cut failure refuses the positions it points at and nothing before them, the lenses still judge the whole artifact with those problems already counted, and the controller reads the report as refusing; a warn only informs.',
  },
  {
    id: 'QL-4',
    statement:
      'Lens outputs are schema-bound with refs enum-locked to real criterion and location ids; an inadmissible type or ref is dropped before scoring and traced.',
  },
  {
    id: 'QL-5',
    statement:
      'Multi-sample agreement confirms an item at or above minHits with lower-middle-median ordinals, discards and traces the rest, and a finding reconciled to a failed or partial criterion is never priced twice; under a pipeline that declares cited corroboration, a confirmed finding that would block — by its type’s gate or its severity — and cites criteria blocks only when the evaluator failed a gating criterion it cites, is priced at the policy’s declared contradicted multiplier when the evaluator judged every criterion it cites pass or not applicable, and one that cites none is priced and never blocks; every decision records by key which validators refused, which findings blocked and which gating criteria failed.',
  },
  {
    id: 'QL-6',
    statement:
      "Every number in a quality-loop decision comes from the policy: weighted criteria results form each dimension's base, confirmed findings subtract priced, decayed, clamped penalties, unassessed dimensions renormalise out, and the trace reproduces every figure.",
  },
  {
    id: 'QL-7',
    statement:
      "An evaluator's advisory verdict is recorded in the trace and structurally unreadable by the policy: the evidence ledger carries no prose, and flipping every verdict leaves the decision byte-identical.",
  },
  {
    id: 'QL-8',
    statement:
      'Gates and routing are ordered and deterministic — artifact, validators, evidence, blockers, accept threshold, reject floor, fixability route — each step traced, a gate that decides with what it decided on as data (the numbers it compared, the ids it named), and a blocking finding never accepts.',
  },
  {
    id: 'QL-9',
    statement:
      'The loop revises or retries with the selected remediations, keeps the best artifact by a strict-better gate, stops with an explicit reason, and when every model call fails escalates honestly with llm-failed diagnostics and no invented number.',
  },
  {
    id: 'QL-10',
    statement:
      'Every quality-loop run writes a dump — goal verbatim, contract, pipeline summary, per-iteration evidence and decision, every exchange attributed by stage and sample under concurrent lenses, lessons — on the failure path too; the HTTP surface validates with zod and lists its pipelines.',
  },
  {
    id: 'QL-11',
    statement:
      "The service publishes a prompt library from markdown files behind GET /prompts and allows the web client's origin.",
  },
  {
    id: 'QL-12',
    statement:
      'The run on the wire is the shared contract: every quality-loop wire type lives in contracts, GET /runs/:id summarises exchanges, and each iteration carries its rendered artifact.',
  },
  {
    id: 'QL-13',
    statement:
      'Runs persist through MikroORM in normalized tables — run, criteria, iterations, findings, criterion results — reassembling the wire record exactly, listing newest first, and surviving a restart: a row left running by a dead process is failed only once its heartbeat is stale, and a late close from its owner reclaims it with the true outcome.',
  },
  {
    id: 'QL-14',
    statement:
      'A pipeline that needs more than a prompt owns an input codec: the composed goal round-trips through it, its schema refuses a goal the engine would clip, and exact checks over its index are validators that block — no rule parses prose.',
  },
  {
    id: 'QL-15',
    statement:
      'Experience is digested from facts the engine established — remediations selected, findings persisted or resolved, criteria improved or regressed, scores moved — never from an effect a model authored.',
  },
  {
    id: 'QL-16',
    statement:
      'A memory run composes recall, the target pipeline, digest and store through the existing runs service alone: usable memory — kept chunks no confirmed finding names — reaches the target goal as an advisory section within the goal budget, the digest sees the bare prompt, only accepted memories and the engine evidence they cite are stored, every skipped or failed step carries a closed reason, and an interrupted memory run is failed at boot.',
  },
  {
    id: 'QL-17',
    statement:
      'Memory lives in a dedicated vector store started and stopped with the stack: chunks are upserted under deterministic ids per source run and ref so re-digesting replaces them, a collection is bound to one embedding model and dimension so a search never mixes models, the prompt embedding is cached by content hash and model in the run database, and store availability is verified at boot and reported as data.',
  },
  {
    id: 'QL-18',
    statement:
      'Embeddings are a port beside the LLM client chosen from the environment — no OPENAI_API_KEY yields a disabled client that carries its reason, the memory tier being optional — reached over an injectable transport that batches, retries a rate limit once and refuses a vector of the wrong length.',
  },
  {
    id: 'QL-19',
    statement:
      'An orchestrator is data over registered pipelines: a step runs only a registered pipeline its declaration names — an unregistered choice skips the step, naming it — and keeps every child it opens; calibration runs one goal samples times and second opinion judges a first artifact again, judge-only, each through a panel that counts and leaves out a failed sample; the router offers every brief-taking pipeline as a route, runs the one its classifier chose from a schema locked to them, refuses a named pipeline and fails a brief it cannot place; and a reconcile reports where two or more runs disagree — decisions, gates, score spreads, finding types — without judging it.',
  },
  {
    id: 'QL-20',
    statement:
      'A run may carry its rubric: supplied criteria are used verbatim and the deriver is never asked, a rubric that does not fit the pipeline is refused before any row exists, POST /criteria derives a rubric from a goal alone and answers 503 rather than an empty rubric when the model derives none, and the health report names the model backing the loop.',
  },
  {
    id: 'QL-21',
    statement:
      "The studio's two pipelines are ordinary registered pipelines: a canvas is judged as a provided artifact whose locations are positional with the author's ids printed beside them, the coach keeps every author id and prefixes what it adds with ai-, and a prompt drafted from an experience renders through the one markdown convention the studio stores — both pipelines being internal to the orchestrators, never routes for a brief.",
  },
  {
    id: 'QL-22',
    statement:
      'Which model the loop calls is declared, not environmental: config/engine.json names a file under config/llm/ that carries the provider, the model, and for an OpenAI-shaped endpoint its base URL and which of OpenAI’s two APIs it is asked through — a name for the variable holding a key, never a key — and a checkout that chooses nothing runs on the Claude Code subscription. Whichever provider is chosen, serve and run prove at boot without a model call that it will answer and exit 1 saying how to fix it otherwise, announcing the model and the file that chose it; replay boots without one because it calls no model. The Claude Code provider accepts only the first-party subscription — a machine login or CLAUDE_CODE_OAUTH_TOKEN — and no API key or gateway token is ever passed to its process. Availability is read from the constructed client, never re-derived from the environment.',
  },
  {
    id: 'QL-23',
    statement:
      'A run may adopt a recorded iteration of an earlier run — same pipeline id and version, equal rubric — verbatim as iteration 1 in mode adopted, with no model call, and the record says which run it adopted from.',
  },
  {
    id: 'QL-24',
    statement:
      'Every pipeline declares its goal source; a composed-goal pipeline is never a route for a brief, a target for an orchestrator, or a choice in the loop UI.',
  },
  {
    id: 'QL-25',
    statement:
      'A pipeline may declare a deterministic normalize the loop applies to produced artifacts only, before validation, so what is judged is what is stored; and a producer is told why its last revision was refused by a validator.',
  },
  {
    id: 'QL-26',
    statement:
      'What a wave of lenses yields is a function of declaration order — lenses as declared, samples ascending — and never of which call answered first: a sample keeps the number it was planned with, so agreement across samples, the order of the lenses on a confirmed finding, and the rationale carried into the next iteration are all the same whatever the completion order.',
  },
  {
    id: 'QL-27',
    statement:
      "One gate admits every provider call this process makes, so a pipeline's declared concurrency and the number of runs in flight cannot multiply into an unbounded number of subprocesses: it admits in arrival order up to a declared ceiling, frees its permit even when the call throws, never rejects of its own accord, and reports the wait so queueing is charged to neither the call's duration nor its timeout.",
  },
  {
    id: 'QL-28',
    statement:
      "A call the provider failed is asked again immediately, in place, up to a declared number of attempts: what may be retried is a table over the provider's own closed error vocabularies rather than a search through its prose, a rejected request — a refused credential, an invalid ask, a spent budget — is never asked twice, a strained provider is given a bounded pause and holds no permit while it is waited out, and every attempt is recorded in its own right so the rate of first-attempt failures stays as visible as it was.",
  },
  {
    id: 'QL-29',
    statement:
      "A panel runs a declared few of its samples at once and reads them positionally: the runs it hands on, the child ids it records and the failure it reports are functions of the sample index rather than of which sample settled first, so the reconcile report's indices keep meaning what they meant.",
  },
  {
    id: 'QL-30',
    statement:
      "A run's dump folder can be read back as the inverse of the writer: the folder is walked once into a map of relative names, and a read resolves only through that map — so a traversal is not refused by a rule, it simply is not a key, and neither is a symbolic link or a run id the id grammar could not have minted, which is checked before any syscall. A JSON file comes back as text and never parsed, a folder that is not there is absence that claims nothing about the run, and a file that is a key but cannot be served answers in band with its problem named, carrying no stack and no server path.",
  },
  {
    id: 'QL-31',
    statement:
      'The dump is served read-only under the run that owns it: a sorted listing with byte counts, one file by the exact name the listing gave, and a prompt the run record deliberately leaves out of its trace readable there. Being rooted under the run means it neither shadows the run record nor is shadowed by it, and a missing dump or an unknown name is a 404 that says only that.',
  },
  {
    id: 'QL-32',
    statement:
      'A coach run recalls lessons for its prompt and hands them to its producer alone: they are curated by a recorded memory-recall run, shown under their own advisory heading to a producer that declares it consumes memories and never to the deriver, a critic or an evaluator, and recorded on the run with their provenance — recalled, empty or skipped, with the reason, the recall run and the lessons the producer saw — while a recall that cannot run or finds nothing never fails the coach, a grade never recalls, and the coach panel says what was recalled.',
  },
  {
    id: 'QL-33',
    statement:
      'A provider call runs under a time limit derived from what it declares — its whole declared answer at the slowest pace the recorded runs measured, plus a fixed overhead, and never less than a minimum declared once with that policy for the small declarations no recorded call measures — and no successful recorded call would have outlived it: the limit is watched on the wall clock, the turn is aborted when it passes and abandoned a grace later whether or not it has ended, and an abort is read as a timeout from its own signal — never from the name of the error the SDK throws — and asked again once.',
  },
  {
    id: 'QL-34',
    statement:
      "A coach run that adopts a graded iteration recalls for what is wrong with it now: that iteration's confirmed findings and its failing and partial criteria are searched as probes of their own and handed, as their own delimited section, to the probe deriver and to the curator, and the recall's provenance records them; the producer alone is handed the kept lessons, the judges never, and a recall with no base is the same prompt-only recall the memory orchestrator runs.",
  },
  {
    id: 'QL-35',
    statement:
      "A stored lesson carries the decision and number of the iteration it was learned from rather than the run's final decision, so an escalation that a later iteration without an artifact caused never marks a lesson from a judged one, and the curator reads each lesson's own iteration's decision.",
  },
  {
    id: 'QL-36',
    statement:
      'A step plan is a closed-vocabulary artifact judged against a session rubric headed by its declared grounding criteria, once on a fresh page and twice on one that has not changed: a plan that cites a ref the page did not offer, acts on a disabled, hidden, not-visible or behind-the-dialog element, places a terminal action anywhere but last, goes on past an action that replaces the page, runs past the action cap, terminates or closes a unit of work on a page that shows nothing, or claims what the page shows after an action that could have changed it, is cut at that action by a validator the lenses still judge after; and the session runs an accepted plan whole, a plan cut at a position up to it whatever the score, nothing of a plan nothing cut that the loop did not accept, and nothing of a plan whose first action was faulted or whose reading of the page a blocker refused — carrying as objections what blocked and every criterion the evaluator settled short with its statement, never advice; and a session whose page has not changed across the declared number of observations stops as page-stalled, whatever its failure budget.',
  },
  {
    id: 'QL-37',
    statement:
      'Field answers list every field the goal listed exactly once and cite evidence only by listed alias; a value the field cannot take is a located warning the lenses and the caller both read; a field a confirmed finding points at is never filled by the caller; and a field the page hides is left blank whatever the model decided.',
  },
  {
    id: 'QL-38',
    statement:
      "A form's fields are answered over facts recalled without a model call: each field's own label is a probe searched only among what documents taught about the subject, the hits are fused per field and dealt out by rank under one cap — every field's best before any field's second — and listed as evidence every stage reads; a recall that cannot run or finds nothing never blocks the answer, which still runs over the goal as composed; and the target step reports the run's admission so the caller never recomputes it.",
  },
  {
    id: 'QL-39',
    statement:
      "The composed-goal codecs round-trip: what a composer writes, the pipeline's validators read back from the last fenced block; a plausible maximal goal renders under the engine's budget and one past it is refused rather than clipped; and the fence the composers write is pinned equal to the one the engine reads; a model is shown the goal without its index section, which the validators read from the goal as stored.",
  },
  {
    id: 'QL-40',
    statement:
      "A document chunk — a résumé page, a notes file, or the operator's answers from one session — renders as aliased sections and digests into facts in the store's own item shape, each resting on the sections that state it; a section may back several memories; a qualifier its sections put on a claim is carried into the insight and graded as a rule; a finding withholds the facts it names as its type declares on the pipeline's policy, so one saying a fact is wrong withholds every fact it names while one faulting a true fact for its wording withholds none; the digest run is its own source, stamped with its pipeline; and evidence of kind section stays visible to search.",
  },
  {
    id: 'QL-46',
    statement:
      "A lost sample scores but cannot gate: a lens that lost a sample confirms what the samples it has left agree on, with the hits it really has, so the item is priced like any other — and since fewer samples saw it than the policy's agreement asks, no finding or criterion short of that agreement ever blocks; a lens that lost nothing is held to the full agreement; and the lost sample keeps the faults its reply was refused for.",
  },
  {
    id: 'QL-47',
    statement:
      "A size overrun is a warning, never a block: every artifact is read against its schema the way the model seam reads a reply, so only a structural fault blocks, and a field past its target is one warning per field on a validator that blocks nothing, moves no decision and never reaches a judge, who is told as already counted only the validation problems the controller acts on, chosen by its own predicate; a field a reply wrote past its size — the producer's or the deriver's — is an overrun on the record, in the one wording, that degrades nothing; a supplied rubric is refused only past the longest statement its own deriver can return — so any rubric a run derived can be handed back, and boot holds every pipeline's bound under the edge's cap — and recorded as an overrun past the target; every stage is told the rule as it is applied; and a pipeline's output schema is converted for the model when it boots.",
  },
  {
    id: 'QL-48',
    statement:
      "A run's dump reports what the model seam kept: its manifest and its index row count every field a call wrote past its target — of them those past the ceiling, cut and trimmed — and the calls read from a cut transcript or asked again with their faults; run.md lists each such field with the call that wrote it, what was asked, accepted and written and how it was handled, and names on a call's own line the API calls a resumed turn took, a salvaged transcript and a feedback ask; each exchange's record carries its salvage and its API calls; and a record from before the seam salvaged reads as a run that kept nothing.",
  },
  {
    id: 'QL-49',
    statement:
      'Every declared bound and output cap is held to what the model measurably writes: `pnpm measure:bounds` reads the run dumps without writing them — each reply at the size the model wrote it, refused, kept past a ceiling and salvaged ones included — and regenerates one fixture beside each module that declares bounds, and the calls the time-limit spec replays; and a spec fails when a target sits below the 99th percentile written, a ceiling at or below the longest, or a cap less than a fifth above the most its stage wrote on a turn that answered, and when a measured field or stage is gone or a declared one was never measured — unless the spec exempts it with its reason.',
  },
  {
    id: 'QL-50',
    statement:
      'A recall asked for a producer that revises a judged answer tells its curator what that producer already holds: the remediation notes it is handed are listed, aliased, under their own section with the rule that a chunk only restating one is dropped, naming which, and kept only for a fix, mechanism or risk the list lacks; each screened candidate says where it was learned relative to that answer; a kept chunk that only restates a held defect is a precision finding a critic is asked for by name, priced and never gating, and withholds that chunk once confirmed; and a recall with nothing in hand composes the query it always did.',
  },
  {
    id: 'QL-51',
    statement:
      'A recall for a producer that revises a judged answer screens out what that producer already holds: the chain the answer descends from is walked through the recorded runs, the search reaches three times wider than it offers, and after fusion a stored lesson is set aside — first match, with what it matched — when its run is in the chain at an iteration no later than the one held, when the evidence it cites was judged in exactly a link of the chain, or when it is of the same pipeline and prompt and every finding it cites is held; twins another run digested from the same evidence of one prompt take one slot; what each reason does is one declared table; every offered lesson carries its origin; a search that found only what is held opens no recall run and is empty as nothing new; the run records the chain, what was held and what became of the pool; and a recall with nothing held searches, composes and records exactly as before.',
  },
  {
    id: 'QL-52',
    statement:
      "A run's dump says what its recall screened out as already held, and what its goal budget left out: run.md's recall section prints the pool, how many were set aside as already known by reason, demoted, collapsed and offered, and the chain it screened against, then each lesson set aside with what it matched and each lesson handed on with its origin; how many candidates the goal budget left out of the curator's query is counted where the query is built and recorded on the run's recall and the memory orchestrator's recall step alike — zero when every one fit, when none was curated and on a record older than the count — and the recall line says it when any were; recall.json carries the whole record; and a recall that screened nothing and left nothing out prints as it always did.",
  },
  {
    id: 'QL-53',
    statement:
      "What a confirmed finding withholds of the items it names is declared, per finding type, on the pipeline that confirms it, and what a warning validator's problems withhold on that validator — every item, all but the best-supported of a group with ties to the first, or none — checked when the pipeline boots, which refuses the declaration on a blocking validator because its failing problems close admission, by what storing the item as written would do and never by the type's name; one rule reads both off the pipeline's definition for every reader of a run, a digest's memories and a recall's kept chunks alike, withholding every named item where nothing is declared; and each reader counts what it withheld, by source and type.",
  },
  {
    id: 'QL-54',
    statement:
      "A stored lesson is stamped from the evidence it cites, never with its run's best iteration: the digest's index names, for each finding and criterion, the source run's iterations it was seen or assessed in and both ends of each change the record shows in it; each memory is stamped with the latest of the iterations its evidence belongs to and that iteration's own decision, its lineage naming the adopted run's iteration only when that one is the copy; an index written before it named iterations stamps as before; and the decision a recall's curator reads beside the lesson — risk only after a reject or an escalate — is that per-lesson stamp.",
  },
  {
    id: 'QL-55',
    statement:
      "A recalled lesson reaches the producer and the author in the asker's own terms: the labels the curator's query gave the asker's needs — a focused defect, a derived condition, a note already in hand, the curator's own criterion ids — are read back, with the one grammar ids are read from prose by, as the asker's criterion a defect line names or the defect's own words, a curator criterion standing for what the focus labels its statement cites stand for, and every other label dropped; a part the curator named only by labels that stand for nothing is left unsaid; and each lesson carries the pipeline, iteration, decision and day it was learned in, as the curator was shown them.",
  },
  {
    id: 'QL-56',
    statement:
      "A produce after an attempt that was judged and did not beat the best is told what that attempt's judges confirmed: its finding notes as its policy selected them, less any the best's remediations already name, under their own heading after what to fix in the best and without that attempt's locations, which no prompt shows — for a producer that declares it consumes `setbacks`; a producer that does not, an ask after the best itself and an ask after an attempt refused before any judge read it are briefed as before.",
  },
  {
    id: 'QL-57',
    statement:
      "A run's dump headlines the iteration the run stands on: the manifest's and the index row's overall are the best iteration's score, and run.md's verdict line gives the best iteration's overall beside its number, with the last iteration's score in a clause of its own only when the last is not the best — so a run whose last attempt fell short or produced nothing never reads as scoring what that attempt scored.",
  },
  {
    id: 'QL-58',
    statement:
      'Every string and list a model writes into is one declared bound — a target the model is asked for and a ceiling the schema accepts — and a size limit never discards work: a reply a little over is kept whole and recorded, an extreme overrun is cut at a word boundary with a visible marker, a list over is trimmed by whole items, and only a structural fault refuses the reply, with every fault named in one wording.',
  },
  {
    id: 'QL-59',
    statement:
      "The model seam never loses a reply to its own reading: the model is shown every bound at its target and the reply is read to the ceilings through the salvage ladder, so a soft overrun is kept and recorded on the attempt it arrived in and never costs another; a reply refused for a structural fault is asked again with every fault named in the one wording and, when it is small enough, the reply as written; a turn that ended without a result — our limit, the provider's error, a broken pipe — is still read from what it streamed and answers when that holds the whole object, with what ended it on the record; the API calls a turn took are counted; a caller that asks in detail sees the faults of the last refused reply or the overruns of the value; and a run's wire summary counts what each call kept.",
  },
  {
    id: 'QL-60',
    statement:
      "A stored lesson carries the lineage of the iteration it cites — the run and iteration whose judges produced the evidence, which is the adopted run's when the source run's best is the copy it adopted; what the source run adopted; and the hash of the bare goal it was asked — written on every chunk beside the source the curator sees, indexed in the store by judged run, adopted run and goal on a collection built before as well as a new one, read back null from a point written before, and back-filled by a re-index.",
  },
  {
    id: 'QL-61',
    statement:
      "A run whose only judged evidence is an iteration it adopted is not digested — its ledger is a copy an earlier run's digest already read — and the memory step skips it as nothing new, naming the run it adopted from; a run that judged an iteration of its own is digested, with a finding seen only in an adopted iteration left out and counted unless this run judged a change in it, which keeps it marked as adopted from an earlier run so a memory rests on the change and never on the copied finding.",
  },
  {
    id: 'QL-62',
    statement:
      "A lost attempt costs one attempt, never a run: a produce that answers nothing is still decided on the record — no artifact, so it escalates — and spends its iteration, and the loop asks again in the same mode from the same best, its remediations unchanged and every fault the schema refused the reply for named under its own heading; the iteration takes no crown from an artifact and counts toward no plateau; the run stops as produce-lost only when it has lost more produce calls than its policy declares, or has no iteration left to ask in; and the run's final decision is the last one made on an artifact.",
  },
  {
    id: 'QL-63',
    statement:
      "A run says who opened it only when its caller does: the opener — a declared kind, the caller's id and a label — is recorded on the run, carried by every run an orchestration opens and by a recall child, kept by an orchestration started from a run, returned on the record and the list row, and filters both lists by the caller's id; the engine never reads it, and a row recorded before the columns existed reads as opened by nobody.",
  },
  // Quality-loop web client (packages/quality-loop-ui)
  {
    id: 'QLU-1',
    statement:
      "The client lists the prompt library and the pipelines from the service and starts a run with the chosen prompt's markdown as the goal.",
  },
  {
    id: 'QLU-2',
    statement:
      'A started run is polled by its own status until complete or failed; while running, progress shows the attributed model exchanges.',
  },
  {
    id: 'QLU-3',
    statement:
      'Results render, per iteration and from the wire contract alone, the decision with gates and reason, per-dimension scores, criteria evidence joined to the contract, confirmed findings with their remediation notes, and the rendered artifact.',
  },
  {
    id: 'QLU-4',
    statement:
      'The client lists recent runs, reopens one on click or from ?run=<id>, and refreshes the list when a run ends.',
  },
  {
    id: 'QLU-5',
    statement:
      'Every route the client offers is named once as data: the nav bar, each page\'s title and what a navigation announces read the same table, the current route is marked, and what the inspector is pointed at lives in the URL — a target and its link are exact inverses, with every spelling of "nothing selected" producing one link.',
  },
  {
    id: 'QLU-6',
    statement:
      "A run is read out as the sequence of things that happened over one working memory — the engine's declared order, every action labelled by the orchestration, step, quality run and iteration it belongs to — and beginning an iteration clears nothing, so a criterion that moved from fail to pass is one changed row rather than two unrelated ones.",
  },
  {
    id: 'QLU-7',
    statement:
      "Any two states are compared at any depth with arrays addressed by domain identity rather than position: every array the loop's own shapes reach is identified uniquely (proved by walking a state, not asserted), the two shapes belonging to a pipeline or an orchestrator are declared and fall back to position, a reorder reads as a move, the rendered artifact is compared line by line, and the diff agrees with the engine's own lessons about the same transition.",
  },
  {
    id: 'QLU-8',
    statement:
      'The log is append-only and says where each entry came from: an action read out of a snapshot is reconstructed and carries only the time the wire gave it, one a poll revealed is recorded, a payload that changed under a key already seen is appended as a correction rather than edited, and an entry keeps its position and its key however much the log grows — and the log is bounded, with what is trimmed folded into a baseline so no surviving entry’s comparison changes and nothing trimmed can reappear.',
  },
  {
    id: 'QLU-9',
    statement:
      "Every lens's contribution is readable: its declared samples, item cap, token bound and what it consumes beside what each sample actually answered, each item joined to what the ledger did with it — confirmed, charged to a criterion instead, discarded with the normaliser's own count, or inadmissible — with the agreement rule printed beside it, a declared sample that recorded nothing shown as lost, a lens the registry does not list still shown, and the raw-to-merged edge marked as derived because the wire does not carry it. Model calls are counted as calls rather than attempts, so a retry reads as one call asked twice.",
  },
  {
    id: 'QLU-10',
    statement:
      "The whole declared decision policy sits beside what it did this iteration: each controller factor with the parameters it was composed with and the trace's own outcome and detail, a declared gate the iteration never reached named as unreached, the engine's own reserved factor named as the engine's, each dimension's arithmetic from base through every penalty's list price, decay multiplier and clamp to its score, a dimension no criterion kind can earn credit in called out, and the validator the engine injects labelled rather than treated as a surprise.",
  },
  {
    id: 'QLU-11',
    statement:
      'A run still open is followed by its own status with no server change: the latest action is shown and keeps being the latest until a row is selected, selecting one detaches and offers the way back with how many arrived since, the way back clears the named action rather than pinning the newest, scrolling never detaches anybody, a finished run is not followed at all, and the log says how many of its actions it is showing when a filter or its own bound has cut them.',
  },
  {
    id: 'QLU-12',
    statement:
      "An orchestration reads as its declared steps in order — every one of them, including a step that has not run — with what each published for the steps after it, the child runs it opened and each child's own verdict, and the child runs' own actions nested under the step that opened them. The only edges drawn are the blocks the record proves, naming the step that blocked; the orchestrator's declared dependencies are not published and nothing else is inferred, which the view says. The orchestration and the child being inspected are followed; every other child is read once, bounded, the selected one first, and a child left unread is listed as unread.",
  },
  {
    id: 'QLU-13',
    statement:
      "A model call's own transcript is readable beside the record: the system prompt, the user prompt, the raw reply and the call's metadata, read out of the dump by the two fields the record carries — the call's scope and its ordinal. A file's name is decomposed exactly rather than matched by substring, so one scope can never claim another's files, and the position prefix is never read as a label because measured on disk it means something different in nearly every run. A run with no dump says so where the transcript would be and costs nothing else.",
  },
  {
    id: 'QLU-14',
    statement:
      'The inspector says who opened each run and orchestration and how many criteria each run was judged by, and narrows both lists to one opener named in the URL — read from the server, every record that opener opened — keeping the filter on every link the lists offer.',
  },
  // Govcon web client (packages/govcon-ui)
  {
    id: 'GOVU-1',
    statement:
      'The client lists the profiles and the source status from the service, and a pull with a window shows the slice report and the budget it left.',
  },
  {
    id: 'GOVU-2',
    statement:
      'The client lists leads over the score, tier and limit filters; a selected notice deep-links as ?notice=<id> and shows its factor trace.',
  },
  {
    id: 'GOVU-3',
    statement:
      'A notice description is fetched on demand from the detail view and its outcome shown — the text, or that the budget is spent, or the failure.',
  },
  {
    id: 'GOVU-4',
    statement:
      'The client shows the source ledger newest first: every call, its operation, outcome and size.',
  },
  // Shared web libraries (packages/web-kit, packages/web-testing)
  {
    id: 'WEB-1',
    statement:
      'The web apps share one HTTP request core and one status-driven polling hook; a resource is polled until its own status is terminal, backs off while unreachable, and stops only on a 404.',
  },
  {
    id: 'WEB-2',
    statement:
      'Web specs mount through the theme and stub the API at the fetch boundary through the shared harness.',
  },
  {
    id: 'GOVU-5',
    statement:
      'The govcon client is six routes under one shell: the nav is one data table the bar, the titles and the announcer all read, the current route is marked, every client-side navigation is announced, and the active profile is one choice in the header that every page scores against.',
  },
  {
    id: 'GOVU-6',
    statement:
      'The search page ranks the store over its filters without spending, and runs, saves, edits, orders and toggles saved searches into the daily pull — every SAM.gov request behind a click that states its cost.',
  },
  {
    id: 'GOVU-7',
    statement:
      'The pipeline page lists tracked notices by stage with what is due, and a stage, reminder, note or estimate edited inline is written to the service and read back.',
  },
  {
    id: 'GOVU-8',
    statement:
      "The notice page shows the facts, the place of performance and contacts, the attachments as public links, the score trace, the description on demand, the awards of its solicitation and NAICS, the awardee's registration, and the bid panel that puts it in the pipeline.",
  },
  {
    id: 'GOVU-9',
    statement:
      'The intel page fetches awards from the sources the user chose, stating the cost, lists and summarizes what is stored, and looks registrants up by UEI with their exclusion flag.',
  },
  {
    id: 'GOVU-10',
    statement:
      'The settings page edits a profile as data — codes, interests, weights with their live sum, prices, bands and tiers — creates, copies, defaults and removes profiles, shows the service issues per field, and shows the sources and the full ledger.',
  },
  // Government contracting: SAM.gov opportunities (packages/govcon)
  {
    id: 'GOV-1',
    statement:
      'Every SAM.gov record is schema-validated and normalized before it is stored — unknown fields tolerated, known fields typed, dates read in every spelling the provider uses; a record that cannot become a lead is counted and reported, never persisted.',
  },
  {
    id: 'GOV-2',
    statement:
      'A query already pulled inside the cache window is answered from the call log and spends no upstream request; a log that cannot answer degrades to the call with a warning.',
  },
  {
    id: 'GOV-3',
    statement:
      'Upstream calls stop at the declared daily budget over a rolling day and the pull report names every slice it skipped; every attempt counts, and a rate-limited reply is recorded and never retried.',
  },
  {
    id: 'GOV-4',
    statement:
      "A lead's score is a traced weighted sum of declared factors whose points sum to the score; an ineligible set-aside, an excluded notice type, a passed deadline or an inactive notice is a gate, never a weight; ranking is deterministic.",
  },
  {
    id: 'GOV-5',
    statement:
      'The search profile is validated data: factor weights name exactly the factor table and sum to one, codes, bands and tiers are checked when it loads, so a malformed profile fails at boot before any request.',
  },
  {
    id: 'GOV-6',
    statement:
      'Re-pulling upserts by notice id: no duplicate rows, last_seen_at advances, changed fields update, first_seen_at holds, and duplicates within one batch are tolerated.',
  },
  {
    id: 'GOV-8',
    statement:
      'The govcon service is one Nest context two ways: the CLI and an HTTP surface whose every route answers its contract type — 400 with named issues on a bad body or query, 404 on an unknown notice or profile — and a pull answers synchronously with its report.',
  },
  {
    id: 'GOV-9',
    statement:
      'A notice description is fetched at most once: a stored text answers without a request, a fetch is budgeted and recorded as a description call that never reads as a fresh search, the text carries no markup, and a re-pull keeps it.',
  },
  {
    id: 'GOV-7',
    statement:
      'The SAM.gov key is read only by the environment factory; the request URL carries it and nothing else does — not a stored query, a query key, a warning or an error message.',
  },
  {
    id: 'GOV-10',
    statement:
      'Every HTTP attempt against an upstream is one ledger row numbered under its call: a retried server error is two rows, a rate limit or a timeout is one and never retried, and a call that made no attempt leaves none.',
  },
  {
    id: 'GOV-11',
    statement:
      'Every upstream capability spends through the one request gate: SAM.gov operations share one daily bucket per source id, an unbudgeted source is ledgered but never refused, and no adapter reaches the network except through it.',
  },
  {
    id: 'GOV-15',
    statement:
      "A ranking loads only what a gate would not exclude — active, open, a biddable set-aside or none, no excluded type — plus the request's filters, in SQL, bounded by MAX_CANDIDATES with the report saying when the bound cut; leads are ranked deterministically and paged.",
  },
  {
    id: 'GOV-12',
    statement:
      'A bid is one row per stored notice, keyed by it and gone with it: the stage comes from the package vocabulary, an unknown notice is refused before any write, omitted fields keep their value, the stage timestamp moves only with the stage, and the pipeline lists tracked notices scored with their counts and what is due soon.',
  },
  {
    id: 'GOV-13',
    statement:
      'Profiles and saved searches are validated data in the store: every write passes the boot schema (400 with issues per path, nothing written), exactly one profile is the default while any exists, and the shipped profile seeds an empty store once.',
  },
  {
    id: 'GOV-14',
    statement:
      "A pull is exactly the profile's saved searches flagged for it, in pull order, each stamped when run; a saved search or a bare filter runs by itself as a pull of one slice and stores what normalized.",
  },
  {
    id: 'GOV-16',
    statement:
      "A notice's attachments are listed from the stored record with their public SAM.gov links, in order; the client links to them directly — no key is ever appended, nothing is proxied, and nothing is spent.",
  },
  {
    id: 'GOV-17',
    statement:
      "Awards from SAM.gov's Contract Awards API and from USAspending are normalized to one shape, fetched one gated page at a time up to a bound, upserted by source and id, listed and summarized deterministically from the store, and read by the scorer's history factor and by a notice's own solicitation.",
  },
  {
    id: 'GOV-18',
    statement:
      "Registrants are looked up from SAM.gov's Entity Management in batches of at most MAX_UEI_BATCH UEIs, one gated request each, stored by UEI with their registration, claims and exclusion flag (no separate exclusions request is spent); a read answers from the store and the profile's own company is its entityUei.",
  },
  {
    id: 'GOV-19',
    statement:
      'A pull ends at its wall-clock deadline: no slice starts after it, every slice not started is reported as skipped by the deadline, and what was stored before it stays.',
  },
  // Quality-loop client (packages/loop-client)
  {
    id: 'LC-1',
    statement:
      "One port onto the quality loop serves every program that asks it to judge: its HTTP adapter unwraps the envelope, answers a 404 on a read as null, and raises transport-agnostic errors — unreachable, timed out, refused with the loop's own message and the route, or a derivation that yielded no rubric — under declared timeouts, so a consumer that serves HTTP maps them onto its gateway statuses in one place.",
  },
  {
    id: 'LC-2',
    statement:
      "A run awaited through the client is judged alive by its heartbeat against the loop's own stale window, never by its exchange count or status; a run the loop no longer has is lost, one whose beat has stopped is stale, and an orchestration is awaited the same way through the child run its running step has open.",
  },
  {
    id: 'LC-3',
    statement:
      'A caller may declare how long it rides out a restarting loop: within that window a call that never reached the loop, or a read the loop answered 5xx, is asked again at a declared pause, while a timeout and an answered start are never repeated; past the window the call fails as it would have at once, and a caller that declares nothing is never kept waiting.',
  },
  // Browser session (packages/browser-session)
  {
    id: 'BRW-1',
    statement:
      'The session engine decides nothing of its own: every plan, every field answer and every termination it acts on is a recorded quality-loop run or orchestration named by id on the decision row, and the engine adds only declared rails and declared routing; what refused a plan — a critic finding or a validator problem alike — is carried into the next goal once for the plan it was about and whole, never folded into the record of an action.',
  },
  {
    id: 'BRW-2',
    statement:
      "An observation lists the page's interactive elements with the refs the browser minted for it, their roles, names and DOM facts including the traits that mark a field hidden; what an element affords is read from the control beneath it wherever its role alone is ambiguous, never from the role name; an observation names what it could not read — elements seen whose facts never came back, a snapshot its own grammar read nothing from — separately from what it left past its cap, and a read that failed wholesale is taken again rather than reported as a page with nothing on it; a ref resolves only within the observation that minted it, a stale ref is a failure, and a page that would not fit the goal budget is degraded by declared rungs — snapshot, context, elements — never clipped.",
  },
  {
    id: 'BRW-3',
    statement:
      "Fields are routed by declared precedence — the page's admission, the page's own hidden traits, what a judge or validator pointed at, then the model's decision with its confidence and basis — and an operator's answer is filled, recorded with its source, cached for the session, and taught back as a guidance document whose orchestration id lands on the rows it came from.",
  },
  {
    id: 'BRW-4',
    statement:
      "A session ends only by a plan's declared cause, a declared rail, the operator or a fault; its status follows the termination table, and the browser, the write queue and the session row are closed on every path.",
  },
  {
    id: 'BRW-5',
    statement:
      "A session's rows — session, units of work and decisions — are written through a chained write queue that never stalls the browser, with a heartbeat ticker on its own timer, so a reader tells a live session from a dead one by its beat.",
  },
  {
    id: 'BRW-6',
    statement:
      "A session's trace is written incrementally through the shared run-dump plumbing — each step's files land through a temp name and a rename, bytes as well as text — and the index row that claims the folder complete is appended once, when the session is whole.",
  },
  {
    id: 'BRW-7',
    statement:
      'Every flag and environment variable the session reads is declared once as data with its default, validated by name before anything boots, and nothing else in the package reads the environment.',
  },
  {
    id: 'BRW-8',
    statement:
      'The package names no site: the mission, its units of work, its procedure, its stop conditions and its answering policy live in a markdown goal, and the same program runs any goal.',
  },
  {
    id: 'QL-41',
    statement:
      "A stored chunk carries the facets a search can narrow by and a curator can read — what it is about, how strongly it is grounded, and how many other runs confirmed it — every one optional so a point written before them still ranks; a probe states what it will consider as data rather than in the store's own filter language; each writer replaces only the chunk kinds it owns under a source run, so two writers under one run id cannot erase each other; and the payload indexes are ensured on every boot, so a facet added later reaches the collection that already holds the corpus.",
  },
  {
    id: 'QL-42',
    statement:
      "A finished run is digested into typed knowledge written against what the store already holds: an item is a fact, an anti-pattern, a pattern or a procedure; its dimension is one its own cited evidence lands on under the source pipeline's policy; a procedure rests on a finding the engine recorded as resolved and a pattern on a criterion that held throughout; an item that borrows a listed alias, an iteration or a place of this run's artifact is faulted at that item before any lens reads it; and an item that teaches what a known item teaches confirms it by alias instead of being written again.",
  },
  {
    id: 'QL-43',
    statement:
      "The knowledge orchestrator learns from a finished run: it asks the store what it already knows using the run's own evidence as the query and no model call, digests the run against what came back, and stores the result — never reading the run's own points as known, never re-digesting memory a run was handed, and never letting a store it cannot search stop it learning.",
  },
  {
    id: 'QL-44',
    statement:
      'An item whose evidence supports one already stored reinforces it instead of being stored again: the claim is a row keyed by (point, source run) pinned to the text it was made about, the count a search reads is derived from those rows, and digesting one run twice leaves the points, the rows and the counts as they were.',
  },
  {
    id: 'QL-45',
    statement:
      "Two read-only reports answer what the memory tier could not say about itself: for every run that recalled, what became of each defect the recall searched for, read from the engine's own transitions and attributed at run level because the curator's words are prose; and for every brief, the needs no recall could serve, kept against the brief taken bare so the same prompt groups once.",
  },
  // Memory ingest (packages/memory-ingest)
  {
    id: 'ING-1',
    statement:
      'Documents are chunked deterministically — the same text yields the same aliased parts, packed under the declared budget with no overlap and continuity through the enclosing headings — and each chunk is posted to the loop once, one at a time, awaited to settle and recorded in a manifest by its content hash, so a re-run skips what was ingested unless forced.',
  },
  {
    id: 'ING-2',
    statement:
      "Documents are read through a declared table of readers by extension — PDF text from the page's own geometry, markdown and plain text verbatim, JSON Lines one record per titled section through a declared field map — and an extension the table does not name, or a record the map cannot read, is refused by name, never guessed and never skipped.",
  },
] as const;
