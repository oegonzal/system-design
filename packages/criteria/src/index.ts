/**
 * The product's completion criteria as a typed registry.
 *
 * Tests claim a criterion by putting its id in the title — `it('[EVAL-1] …')`,
 * `test('[UX-2] …')` — which is the one marker both Vitest and Playwright can
 * carry. A coverage spec (tooling) fails when any id below has no test, so a
 * requirement cannot silently lose its proof.
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
  // Prompt generation from experience
  {
    id: 'GEN-1',
    statement:
      "A design prompt can be generated from an experience by the grader's prompt pipeline: the run is started, polled, and its best draft claimed once into a prompt marked generated.",
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
      'A prompt shows its markdown and its criteria as chips grouped by kind; the criteria are derived once by the grader, shown as normalising until they arrive, and can be re-derived until a session has been graded against them.',
  },
  // STAR repository
  { id: 'STAR-1', statement: 'STAR stories support create, read, update and delete.' },
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
      "The coach is a revise run: the draft is stored as the author's revision, and every iteration that beat the ones before it is imported once as an assistant revision with its own grade.",
  },
  {
    id: 'DEL-4',
    statement:
      "The grade the studio shows is the run's, read for one iteration and grounded by position onto the graded graph; the studio invents no score, decision or dimension and caches only the terminal scalars.",
  },
  {
    id: 'DEL-5',
    statement:
      'The studio validates structure only — references that cannot resolve — and every problem at once; whether a design is any good is never decided by the studio.',
  },
  {
    id: 'DEL-6',
    statement:
      'Three prompt sources — authored, imported, generated — yield one shape, and a grader without a model answers 503 with its availability rather than an invented rubric.',
  },
  {
    id: 'DEL-7',
    statement:
      'One zod schema defines a design submission for every side: the studio API validates with it, the canvas pipeline declares its artifact with it, and the canvas UI types its store from it.',
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
      'The loop revises or retries with the selected remediations, keeps the best artifact by a strict-better gate, stops with an explicit reason, and without a live model escalates honestly with llm-disabled diagnostics and no invented number.',
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
      'Runs persist through MikroORM in normalized tables — run, criteria, iterations, findings, criterion results — reassembling the wire record exactly, surviving a restart, and listing newest first.',
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
      'Embeddings are a port beside the LLM client chosen from the environment — no key or deterministic mode yields a disabled client with a reason — reached over an injectable transport that batches, retries a rate limit once and refuses a vector of the wrong length.',
  },
  {
    id: 'QL-20',
    statement:
      'A run may carry its rubric: supplied criteria are used verbatim and the deriver is never asked, a rubric that does not fit the pipeline is refused before any row exists, POST /criteria derives a rubric from a goal alone and never invents one without a model, and the health report says which model backs the loop.',
  },
  {
    id: 'QL-21',
    statement:
      "The studio's two pipelines are ordinary registered pipelines: a canvas is judged as a provided artifact whose locations are positional with the author's ids printed beside them, the coach keeps every author id and prefixes what it adds with ai-, and a prompt drafted from an experience renders through the one markdown convention the studio stores — both pipelines being internal to the orchestrators, never routes for a brief.",
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
    id: 'GOV-19',
    statement:
      'A pull ends at its wall-clock deadline: no slice starts after it, every slice not started is reported as skipped by the deadline, and what was stored before it stays.',
  },
] as const;

export const CRITERION_IDS = CRITERIA.map((criterion) => criterion.id);
