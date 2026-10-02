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
      "The coach is a revise run recorded on its session: it starts from the draft, stored as the author's revision, or from a graded revision whose recorded grade the loop adopts verbatim; every iteration that beat the ones before it is imported once, as soon as the loop has recorded it, as an assistant revision with its own grade; one the studio would refuse is reported refused with its problems and never stored, and one with no artifact is reported as such, unscored; while the run is in flight the session takes no submit and no second coach, and says so.",
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
      "What settled a grade's decision reaches the studio as data — the controller step that decided, how many remediations it selected, how many of the criteria were assessed — so the decision is worded where it is read rather than shown as the controller's own sentence.",
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
      'Deterministic validators run before any model; a blocking failure skips every lens and yields retry.',
  },
  {
    id: 'QL-4',
    statement:
      'Lens outputs are schema-bound with refs enum-locked to real criterion and location ids; an inadmissible type or ref is dropped before scoring and traced.',
  },
  {
    id: 'QL-5',
    statement:
      'Multi-sample agreement confirms an item at or above minHits with lower-middle-median ordinals, discards and traces the rest, and a finding reconciled to a failed or partial criterion is never priced twice.',
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
      'Gates and routing are ordered and deterministic — artifact, validators, evidence, blockers, accept threshold, reject floor, fixability route — each step traced, and a blocking finding never accepts.',
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
      'The loop runs only on a Claude Code subscription login — a machine login or CLAUDE_CODE_OAUTH_TOKEN — which serve and run check at boot without a model call, accepting only the first-party subscription and exiting 1 saying what was found and how to get one otherwise; no API key or gateway token is ever passed to the Claude Code process; replay boots without a login because it calls no model; availability is read from the constructed client, never re-derived from the environment.',
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
] as const;
