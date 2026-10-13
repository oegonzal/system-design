import type { Criterion } from './criterion';

/**
 * The browser session (packages/browser-session) and the document ingest
 * (packages/memory-ingest) that fills the memory its form answers recall from.
 */
export const BROWSER_SESSION_CRITERIA: readonly Criterion[] = [
  // Browser session (packages/browser-session)
  {
    id: 'BRW-1',
    statement:
      'The session engine decides nothing of its own: every plan, every field answer and every termination it acts on is a recorded quality-loop run or orchestration named by id on the decision row, and the engine adds only declared rails and declared routing; what refused a plan — a critic finding or a validator problem alike — is carried into the next goal once for the plan it was about and whole, never folded into the record of an action.',
  },
  {
    id: 'BRW-2',
    statement:
      "An observation lists the page's interactive elements with the refs the browser minted for it, their roles, names and DOM facts including the traits that mark a field hidden, and only the options a person can answer with — never one the page disables nor a required select's placeholder, a select resting on either holding nothing, as a read-back finds it too; what an element affords is read from the control beneath it wherever its role alone is ambiguous, never from the role name; a group of choices carries as its context the question its choices are named after and none of them reads, a group of one included; an observation names what it could not read — elements seen whose facts never came back, a snapshot its own grammar read nothing from — separately from what it left past its cap, and a read that failed wholesale is taken again rather than reported as a page with nothing on it; a ref resolves only within the observation that minted it, a stale ref is a failure, and a page that would not fit the goal budget is degraded by declared rungs — snapshot, context, elements — never clipped; a dialog in front that says by ARIA it is still loading is read again until it has loaded, and the reading records, read by read, what the loading check saw inside each dialog in front and whether it counted.",
  },
  {
    id: 'BRW-3',
    statement:
      "Fields are routed by declared precedence — the page's own hidden traits, the page's admission, what the orchestration's report withholds at the field (consumed, never recomputed from the run's findings or warnings), then the model's decision by the kind it declares its value rests on, through the answering settings — and an operator's answer is filled, recorded with its source, cached for the session, and taught back as a guidance document whose orchestration id lands on the rows it came from; an answer the page refuses is put back to the operator with why, not offered again, as many times as the operator settings declare, so a field fixed in the browser is read back and kept, and past that the refusal stands.",
  },
  {
    id: 'BRW-4',
    statement:
      "A session ends only by a plan's declared cause, a declared rail, the operator or a fault; its status follows the termination table, and the browser, the write queue and the session row are closed on every path. The operator's stop — a reply, the process signal, or Ctrl-C at an open terminal question — withdraws a question waiting on them as abandoned, asks nothing after it, and ends the session the same way.",
  },
  {
    id: 'BRW-5',
    statement:
      "A session's rows — session, units of work and decisions — are written through a chained write queue that never stalls the browser, with a heartbeat on its own timer, let finish before the session closes, so a reader tells a live session from a dead one by its beat.",
  },
  {
    id: 'BRW-6',
    statement:
      "A session's trace is written incrementally through the shared run-dump plumbing — each step's files land through a temp name and a rename, bytes as well as text — and the index row that claims the folder complete is appended once, when the session is whole.",
  },
  {
    id: 'BRW-7',
    statement:
      "Every flag and environment variable the session reads is declared once as data with its default, and how a session runs and what it images are files in the package's own config/ — a choices file naming one complete file per kind, every value in the files alone, a flag overriding its field for one run — all validated by name before anything boots, a kind left unchosen refused naming the file; nothing else in the package reads the environment.",
  },
  {
    id: 'BRW-8',
    statement:
      'The package names no site: the mission, its units of work, its procedure, its stop conditions and its answering policy live in a markdown goal, and the same program runs any goal.',
  },
  {
    id: 'BRW-9',
    statement:
      "A session documents what it did as images beside each step's own screenshot, as its declared capture policy says: the browser actions it names once they ran — a plan's own and every field entry, a value the operator typed and the session read back included — and, when it asks, an action the page refused as the page stood; a field entry is outlined in its image and unmarked after, every image is the page at CSS scale, each step lists its images with the action that made them, a file name never carries the value entered, and an image that could not be taken never fails the session.",
  },
  {
    id: 'BRW-10',
    statement:
      'The operator is asked on every channel at once — the terminal always, and each channel the settings add — and the first answer is taken: every other channel is withdrawn with who answered and what, its withdrawal awaited, and one that answered in the same moment is told its answer went unused; a channel that fails while another still asks is said once and its recovery once, only every channel failing fails the question, and Ctrl-C at the terminal withdraws the rest and ends the session.',
  },
  {
    id: 'BRW-11',
    statement:
      'A field is put to the operator one way on every channel: its options as lettered choices, the answerer’s pick marked as not filled with why, free text where the field takes it, and the commands to read back, leave blank or stop; a reply is read with the contracts’ one resolver, the full value behind a choice is what is filled, the decision row records the channel and what the answer was chosen from, and a line typed at the terminal with no question open is said to be unused, never kept for the next.',
  },
  {
    id: 'BRW-12',
    statement:
      'A field with no options that goes to the operator is asked at once, and suggested answers are asked for once per form, for exactly those fields, under the session’s own derived rubric: they are lettered record first, then the drafts labelled apart as transferable or invented, less every one the run’s report withholds and none from a run no judge saw; when they arrive before an answer the question is withdrawn as superseded and asked again with them, an answer given first is taken and nothing is asked again, a faulted run is warned once and leaves the question as asked, the full text behind a letter is what is filled, cached and taught, the decision row records what it rested on, and the fields file records what became of the suggestions.',
  },
  {
    id: 'BRW-18',
    statement:
      'The first suggestion in lettering order whose basis the answering settings’ drafts table types is filled without a question — ready before the question, none goes out; arriving while one waits, the question is withdrawn saying what was filled, an answer given in the same moment standing — recorded from memory naming the run that drafted it, cached as what the field holds, taught to nobody since the record already holds it; a typed suggestion the page refuses is asked as any refused answer and never typed again; and a suggestion whose basis the table offers reaches the operator as before.',
  },
  {
    id: 'BRW-13',
    statement:
      'A unit of work carries the identity its mission declares: the facts named under Unit identity, read by the one declared-section grammar every mission section uses, carried by every taskStart as facets with their values as the page names them, compared across sessions by one fixed-locale key, stored on the task row and rendered beside each open and closed unit; the units an advisor puts on record are rendered under Units of work by stance within a bound, and only the forbidden ones reach the goal’s index.',
  },
  {
    id: 'BRW-14',
    statement:
      'A mission names its advisors and the environment says only where each is: every declared section is parsed and every named advisor described, matched to its name, held to the facets the mission declares and asked once before the session has a row, a beat or a dump folder — an advisor nobody runs, one needing an undeclared fact, or a session with no subject of its own refuses the session by name — and before every plan each advisor is asked again, its answer composed into the goal with the forbidden units in the index, a faulting advisor said once and ridden on its last good advice with a single probe a step until it answers again, the step’s advice file and the plan row recording what the composer saw.',
  },
  {
    id: 'BRW-15',
    statement:
      'A session says what happened for whoever keeps a record of its units beyond it — started, unit opened, unit closed, ended — as declared bus topics carrying the engine-minted unit id, its declared identity and the session’s own lifetime, published on a queue of their own so a bus riding out a restart never holds a row behind it, the end said before the drain, the close waiting one window for them all and recording what stayed unsent; and a recorded session’s events can be published again from its rows.',
  },
  {
    id: 'BRW-16',
    statement:
      'A field is filled or put to the operator by two declarations and nothing else: the kind its answer declares its value rests on, read through the answering settings’ table of which kinds fill — total over the vocabulary, a value resting on nothing never filled, chosen in a settings file like every other kind — and the locations the orchestration’s report withholds; the open unit of work reaches the answerer with the identity its mission declared; and the decision row records the kind.',
  },
  {
    id: 'BRW-17',
    statement:
      'An operator’s answer is taught under what its field asks — the label, then the words beside it, as one text the recall’s probe is searched with — as the subject’s answer to that question with where and when it was asked kept apart as provenance and a chosen draft said to be one, parsed through the guidance schema before it is taught; a field that asks nothing it can be told by is kept for the session and taught to nobody, and the step says so; and the answers a folder of session dumps recorded — an older item under its label and context, a newer under its question — are taught again in that shape batched per session as one document may carry, their rows linked to the new orchestration and each earlier digest retracted once the new facts stand, or planned and posted nowhere under a dry run — under the subject a dump’s own teachings name, else the one given, and never the environment’s placeholder, which is refused.',
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
  {
    id: 'ING-3',
    statement:
      'A forced re-ingest retracts what a chunk’s earlier digest stored — by the digest run id the manifest keeps, before the chunk is posted again — and the report counts the retractions, so the store never holds two digests of one chunk; and the studio’s record of the subject — its experience profiles and STAR stories, read whole from the studio’s paged lists — is written as markdown documents through a declared field map, one titled section per record and a story’s four parts as its own headings, a source with no records writing nothing, so the record is ingested like any other document.',
  },
];
