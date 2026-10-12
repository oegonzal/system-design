import type { Criterion } from './criterion';

/**
 * The loop's clients: the web client (packages/quality-loop-ui) and the program
 * client every other package judges through (packages/loop-client).
 */
export const QUALITY_LOOP_CLIENTS_CRITERIA: readonly Criterion[] = [
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
];
