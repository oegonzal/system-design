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
    statement: 'Components declare operations and responsibilities, and connections carry them.',
  },
  {
    id: 'UX-6',
    statement:
      'A design brief — requirement bindings and traced flows — is authored alongside the diagram and submitted with it.',
  },
  {
    id: 'UX-7',
    statement: 'Every block kind teaches what it is for and when to use it in the UI.',
  },
  {
    id: 'UX-8',
    statement:
      'The walkthrough is authored as reference-anchored slots — an overview, a rationale per component, a narration per requirement — and each slot shows the same graded verdict the engine will read.',
  },
  {
    id: 'UX-9',
    statement:
      'Suggested bindings are proposals the author accepts or dismisses one at a time; an unaccepted proposal is never submitted, and each shows the same corroboration verdict the grade will use.',
  },
  {
    id: 'UX-10',
    statement:
      'A run exports in one click as a single zip — the diagram as a PDF plus prompt, narrative, brief, feedback and revisions each as its own Markdown file — so a design survives outside the database.',
  },
  {
    id: 'UX-11',
    statement:
      'A stuck author can hand the design to the AI coach: the coach tab streams the run’s trajectory live while it works, the improved design loads back from the timeline, and every machine-made revision is marked with its assistant origin. Without a live model the control explains itself instead of failing.',
  },
  {
    id: 'UX-12',
    statement:
      'A practice URL for a session that no longer exists shows a graceful not-found with a way back to the dashboard, never a raw server error; a transient load failure offers a retry instead.',
  },
  // Prompt generation from experience
  { id: 'GEN-1', statement: 'A design prompt can be generated from a seeded experience.' },
  {
    id: 'GEN-2',
    statement: 'The same experience, difficulty and seed produce an identical prompt.',
  },
  {
    id: 'GEN-3',
    statement: 'A prompt presents scenario, functional requirements, NFRs and scale targets.',
  },
  {
    id: 'GEN-4',
    statement:
      'Successive generated prompts vary: a fresh seed is drawn per generation and redrawn while its framing echoes a recent prompt, and generating without an experience rotates to the least-practiced one — so practice covers every archetype instead of repeating the same prompt.',
  },
  {
    id: 'GEN-5',
    statement:
      "A prompt can be authored from an assessment's own requirements — validated against the same vocabularies and spec closure the generator honors — and graded by its experience's archetype rubric as it applies to those requirements.",
  },
  // Critic / eval pipeline
  { id: 'EVAL-1', statement: 'A submitted revision is graded with per-dimension scores.' },
  {
    id: 'EVAL-2',
    statement: 'Findings teach: each carries a message and points at affected elements.',
  },
  {
    id: 'EVAL-3',
    statement: 'An accepted suggestion, resubmitted, improves the overall score.',
  },
  {
    id: 'EVAL-4',
    statement: 'Unmet expectations surface as teaching findings with ghost-fix suggestions.',
  },
  {
    id: 'EVAL-5',
    statement:
      'Scores are calibrated: an empty canvas fails, a naive design fails, and only demonstrated depth earns an A.',
  },
  {
    id: 'EVAL-6',
    statement:
      'An LLM pass never emits the findings or coverage the score reads, nor authors a number: its advisory axes and scenarios ride beside the grade for display, and a rogue LLM scoring artifact is dropped.',
  },
  {
    id: 'EVAL-7',
    statement:
      'Adversarial scenarios are selected deterministically and narrated as failure stories.',
  },
  {
    id: 'EVAL-8',
    statement: 'Every evaluation records the profile it was graded under and its evidence trail.',
  },
  {
    id: 'EVAL-9',
    statement:
      'A component that no traced flow and no corroborated binding accounts for becomes a finding.',
  },
  {
    id: 'EVAL-10',
    statement:
      'A submitted brief earns the explanation dimension by corroboration: each claim is checked against the diagram the author drew.',
  },
  {
    id: 'EVAL-11',
    statement:
      'A design submitted without a brief — or with one that names more components than hold a claim — is graded on that, never excused from the explanation dimension.',
  },
  {
    id: 'EVAL-12',
    statement:
      'A claim the diagram cannot back up is caught deterministically and costs more than making no claim at all.',
  },
  {
    id: 'EVAL-13',
    statement:
      'Every evaluation writes a run dump: its inputs, every LLM prompt and response, the scoring arithmetic, and the result — on the failure path too.',
  },
  {
    id: 'EVAL-14',
    statement:
      'An improvement run raises the score monotonically: every accepted iteration persists as an assistant-origin revision graded strictly higher than the one before, and rejected candidates are never persisted as revisions.',
  },
  {
    id: 'EVAL-15',
    statement:
      'The design narrative is graded by reference and required for a top grade: a missing or insubstantial walkthrough both loses explanation points and caps the letter grade below an A.',
  },
  {
    id: 'EVAL-16',
    statement:
      "A critic or evaluator lens's grounded ordinal evidence — a weakness magnitude and confidence tied to a prompt requirement and the affected components — moves the score only through the engine's generic, bounded, weakness-only deterministic scorer: it can lower an already-assessed dimension, never by a raw LLM number, never past a deterministic cap, and never at all on the deterministic path.",
  },
  {
    id: 'UX-13',
    statement:
      'The config-knob vocabulary is one declarative table shared by the editor, the drift gate, the suggester and the validators — a knob the grader cannot read cannot be set.',
  },
  {
    id: 'UX-14',
    statement:
      "A component's interface can be suggested: proposals are enum-locked to that component's gradeable vocabulary, verified by the same validators submit runs, and accepted one at a time — never all at once.",
  },
  {
    id: 'EVAL-17',
    statement:
      'Every LLM lens — critic, narrative, depth, workability, scenarios — emits grounded graded evidence; none emits a free-form finding.',
  },
  {
    id: 'EVAL-18',
    statement:
      'A running evaluation refreshes its job lock at every pass boundary, fenced by the worker that holds it, so a long live eval is never reaped as dead nor resurrected by a stale heartbeat.',
  },
  // STAR repository
  { id: 'STAR-1', statement: 'STAR stories support create, read, update and delete.' },
  { id: 'STAR-2', statement: 'Stories are searchable and filterable by tag.' },
  { id: 'STAR-3', statement: 'A story can link to a prompt and an experience.' },
  // Business-workflow (product) layer
  {
    id: 'PRD-1',
    statement:
      'A workflow prompt presents its API contract, events, ingest SLAs and entity lifecycle beside the prose requirements.',
  },
  {
    id: 'PRD-2',
    statement:
      'Workflow coverage is claimed by reference — a Fulfills pick and event emissions — and corroborated structurally, never by matching names.',
  },
  {
    id: 'PRD-3',
    statement:
      'On a workflow prompt, declaring nothing scores the product dimension 0; on any other prompt it is not assessed and renormalizes out.',
  },
  {
    id: 'PRD-4',
    statement:
      'Workflow coverage chips show the same corroboration verdict the grade will use, live while authoring.',
  },
  {
    id: 'PRD-5',
    statement:
      'Freshness SLAs are graded structurally: declared polling cadence and push wiring against the budgets the prompt states.',
  },
  {
    id: 'PRD-6',
    statement:
      'The workability axis reports ordinal factor evaluations with rationales and never moves the deterministic score.',
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
] as const;

export const CRITERION_IDS = CRITERIA.map((criterion) => criterion.id);
