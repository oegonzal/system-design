import type { Criterion } from './criterion';

/**
 * The quality-control loop engine (packages/quality-loop).
 */
export const QUALITY_LOOP_CRITERIA: readonly Criterion[] = [
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
      'Runs persist through MikroORM in normalized tables — run, criteria, iterations, findings, criterion results — reassembling the wire record exactly, listing newest first, and surviving a restart: a row left running by a dead process is failed only once its heartbeat is stale, and a late close from its owner reclaims it with the true outcome; the janitor’s sweep and every heartbeat never overlap their own last run and are let finish before the store closes.',
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
      'A run may carry its rubric: supplied criteria are used verbatim and the deriver is never asked, a rubric that does not fit the pipeline is refused before any row exists, POST /criteria derives a rubric from a goal alone and answers 503 rather than an empty rubric when the model derives none — its message saying what ended the call, the provider’s or CLI’s own error where the model was never reached — and the health report names the model backing the loop.',
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
      'Field answers list every field the goal listed exactly once and cite evidence only by listed alias; a value the field cannot take is a located warning the lenses read and the orchestration’s report withholds; what each finding type and validator withholds is declared on the pipeline — a wrong value every ref, a needless ask or a required blank none — so a field the report withholds is never filled by the caller and one a finding merely prices is routed on its own merits; and a field the page hides is left blank whatever the model decided.',
  },
  {
    id: 'QL-38',
    statement:
      "A form's fields are answered over facts recalled without a model call: each field's own label is a probe searched only among what documents taught about the subject, and of what was recorded for one unit of work only the unit the page names; the hits are fused per field and dealt out by rank under one cap — every field's best before any field's second — and listed as evidence every stage reads; a recall that cannot run or finds nothing never blocks the answer, which still runs over the goal as composed; and the target step reports the run's admission so the caller never recomputes it.",
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
      "What a confirmed finding withholds of the items it names is declared, per finding type, on the pipeline that confirms it, and what a warning validator's problems withhold on that validator — every item, every item where its judge marks the finding requires_user, or none — checked when the pipeline boots, which refuses the declaration on a blocking validator because its failing problems close admission, and on any validator a withholding that reads a finding's fixability, which a validator's problem does not carry, by what storing the item as written would do and never by the type's name; one rule reads both off the pipeline's definition for every reader of a run, a digest's memories and a recall's kept chunks alike, withholding every named item where nothing is declared; and each reader counts what it withheld, by source and type.",
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
  {
    id: 'QL-64',
    statement:
      "Suggested answers for a form's operator questions are labelled by what they rest on — the record, recorded work carried over, or experience the record does not hold where the goal's suggesting policy allows — with what each label promises fixed for every goal; a suggestion for a field the form never listed or resting on an alias it never listed blocks the iteration, while one that cites nothing it should or that its field cannot take only warns at that suggestion; every faulted suggestion but a repeat is withheld from whoever offers them, nothing gates, and the run is judged once; a suggestion for an account of experience is as long and as concrete as the goal's suggesting policy asks, and the orchestrator reads the artifact as the session does — a text a little past its bound withholds nothing by itself; a suggestion says nothing about the open unit of work or the organisation it is for that an item it cites does not state; a record suggestion, which may be typed in the operator’s place, is bound by the answering policy; and a field describing an unnamed entry of a list takes a record suggestion only from the entry the policy’s order takes, none when listed without its group.",
  },
  {
    id: 'QL-65',
    statement:
      'The form-memory orchestrator runs exactly the form pipeline a request names, from its declared list, and only over a goal the form codec composed for that pipeline; the evidence it composes in says what the store holds each item as and where it holds, and its target reports the run’s admission and the locations a reader of the run withholds — each with what withheld it and why, in the judge’s own words — read off that pipeline’s own definition.',
  },
  {
    id: 'QL-67',
    statement:
      'An orchestrator declares the shape of every report its steps make and of the context it records at open, each a contracts schema the loop and a client share: the runner holds every report to its shape — one the shape refuses, or one from a step that declares none, is nulled with a note while the step keeps its status, output, counts and runs — a declared shape naming no step fails boot, and a context the shape refuses refuses the start.',
  },
  {
    id: 'QL-66',
    statement:
      'The browser-step limits validator holds a taskStart to the unit identity its goal declares, from the index alone: one that lacks a declared fact, names one the mission does not declare or names one twice is cut at that action, and one whose facets match an identity the index lists as forbidden is cut with the record’s note and the alternative said back in the words the session’s refusal uses; one declaring it takes a unit on record is cut where the index says the mission declares no exception, or that this page lists the control the exception is tied to — while which unit it takes is the session’s check, and a unit merely to avoid stays prose for the planner.',
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
  {
    id: 'QL-68',
    statement:
      'A field answer declares how its value rests on the evidence by one word of a closed vocabulary shown to the answerer and the judges from one table; the limits validator warns, located and withholding, on a value resting on nothing, a kind that cites no evidence, a mapping with no options to map onto, and a kind declared on a decision that fills nothing; the grounding critic faults a value nothing bears on and a kind claiming more than the evidence gives, the form critic an option that does not carry the fact or that another option carries as well; and what each type withholds is declared on the policy — a value nothing bears on, a contradicted value, a misfit option and a trap every ref; an overstated kind every ref where its judge marks it requires_user, doubting the value rather than its label, and none otherwise; a needless ask and a required blank none. A yes or no against a threshold the question states rests, derived, on the figure or span the evidence states for that same skill or category; one from a figure for another category is overstated. A bound — an earlier yes to a threshold, or a sum of the dated roles the evidence happens to list — is the least a figure can be: it settles a threshold it meets and never a figure or a threshold it falls short of, and a field asking for the figure with no figure or span stated is the operator’s. A value the page refused is never kept, and a question asking how many takes the bare whole number. Whatever its kind, a value claims nothing about the open unit of work or its organisation that its cited evidence does not state, and a part of a question nothing listed bears on is left out and named, never filled with an unstated stance. Fields describing one unnamed entry of a list on record are filled from one entry — the one the answering policy’s order takes, a later group the next, or the only entry that could fill them — an earlier answer settling such a field only for the entry it was given about; a group mixing entries is inconsistent, one choosing among several against the order or with none declared ungrounded, and several possible entries with no order go to the operator.',
  },
  {
    id: 'QL-69',
    statement:
      'A document memory declares where it holds — of the subject wherever asked, or of the one unit of work it was recorded for — by a closed scope the digest writes, the stored point carries, the form goals render beside the kind under one legend, and a point written before scopes reads as the default; a document may instead declare one scope for every memory it holds — a fact of the goal’s index and a limit every lens reads, its rules leaving out the scope test the declaration replaces and its limits naming the store, which stamps the declared scope on each memory over whatever the digest wrote — while a document that declares none renders byte for byte as before, so no recorded chunk is named anew; a fact scoped where it does not hold is a gated falsehood that withholds every memory it names, except under a declared scope, where the document’s declaration decides each memory’s scope over the judges’ verdict, so the finding withholds nothing — by a table the pipeline declares for that case beside its policy, under which every other finding withholds as the policy declares — and provenance leaking into a subject fact is wording that withholds nothing; and a document digest judged below the bar is still drawn on where the engine’s own gates held — an artifact present that the validators passed — with every memory a confirmed finding withholds still withheld, the step saying it stored what was judged and not refuted; and where cited sections date a role or the roles a technology was used in, the digest states both ends and the span between them in whole years and months computed from those dates alone, an open end computed to the document’s date and said so — a rule the deriver writes a criterion for, the grounding critic allows from stated dates alone, the coverage critic misses and the rules evaluator grades.',
  },
  {
    id: 'QL-70',
    statement:
      'A digest run’s memories are retracted by its id — every point it stored gone, whatever its kind, and a run the store never held removing nothing — through DELETE /memory/:id and the client port’s retraction, so a document taught or ingested again closes behind itself and the store never holds two digests of one document; one memory is retracted through DELETE /memory/:id/points/:ref by the run it was digested from and its ref — a document’s digest run, the run a lesson or knowledge item was learned from — that point alone gone, the run’s other memories and every other run’s left standing, the answer carrying the text, kind and scope it held because the store keeps nothing of a point once it is gone, a point the store never held and one whose payload this build cannot read both removing nothing and answering null, the second left standing and logged as held, and an address whose ref is empty or missing matching no route rather than the run’s own retraction; no retraction is recorded, so a re-index of a memory run stores again a lesson retracted from it; a form page’s recall takes hits per probe by the kind of control asking — a declared table over every field type, a free-text field drawing deeper than a control that takes one value, a question two controls share taking the deeper budget — and POST /memory/form-retrieval-report answers what that recall would retrieve per field — the probe, the budget, each named vector’s ranking with its cosines, the field’s fused list with the aliases the page’s evidence would carry — running no pipeline.',
  },
  {
    id: 'QL-71',
    statement:
      'A memory recorded for one unit of work is read only for that unit: a unit is keyed by the identity its mission declares — whichever mission declares it — or by its own id where it declares none, so two units of one identity are one; the operator’s answers are taught in guidance documents each holding one unit’s answers, its head naming that unit in the index alone — no lens told of it, a document naming none rendering and hashing as before, and the digest’s report carrying it — and the reader stamps the key on every memory of a scope bound to a unit by one total table, withholding, named by the index, such a memory of a document that names no unit — the digest step counting each and giving it as its reason beside whatever else it stored, so the chunk never reads as one whose facts are all stored — while the orchestrator refuses before a row a document declaring every memory so bound that names none; the store indexes scope and key, and every search leaves out inside its filter every memory bound to a unit but those of the unit it names — all of them when it names none — so the slots they leave are refilled, no clause stated when no scope is bound, and the in-memory store answering every such search with the adapter’s whole hits on a real Qdrant; a form goal’s index names its unit, which the recall searches under, one engine-stated sentence of the scope legend — built from the table of bound scopes, and none when the goal names no unit or no scope is bound — saying every such item listed was recorded for a unit its mission identifies as the goal’s; and the form retrieval report takes the unit and lists each hit with its kind, scope and unit.',
  },
  {
    id: 'QL-72',
    statement:
      'A tool plan is a closed-vocabulary artifact over a declared tool index — calls naming tools from the index with their arguments as one JSON object in a string, or one question, or a finish on a declared cause — judged against a session rubric headed by declared grounding criteria and one gating claim criterion: a plan that names a tool the index does not list, runs past the call ceiling, puts a call after an irreversible or approval-gated one, gives arguments that are not one object of the declared keys with every required one of its declared type, repeats with the same arguments a call that failed or was refused at the last step, puts a question or a finish beside a call or beside each other, finishes on a cause the mission did not declare or before anything was observed, or plans nothing, is cut at that part by a validator the lenses still judge after; the goal that carries the index is composed from the mission, the tools by their program, the observations oldest first, the recent calls, the objections, the progress and the limits, fitted to the budget by declared rungs that trim observations and nothing else; and the session runs an accepted plan whole, a cut plan up to the cut, nothing of a plan whose first call was faulted or whose reading a blocker refused, and a finish or an irreversible call only when the loop accepted the plan.',
  },
  {
    id: 'QL-73',
    statement:
      'Every pipeline whose artifact is a plan of positional parts is read back by one procedure in the contracts, parameterised by the plan schema, the location grammar, how to address a part and which plans are irrevocable: the best iteration by its number, the blockers from the decision’s own account, the cut point where they point — whole for one at the assessment or outside the grammar, the first faulted part otherwise — the objections the next plan must answer with each shortfall’s statement and reason, and the readout that runs an accepted plan whole, a cut plan up to the cut, nothing of an under-judged plan or of an irrevocable one the loop did not accept; a browser session’s actions and a tool session’s calls route through that one procedure and copy none of it.',
  },
];
