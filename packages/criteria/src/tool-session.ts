import type { Criterion } from './criterion';

/**
 * The tool session (packages/tool-session): a mission run as tool calls the
 * loop decides, over whatever tools a program declares.
 */
export const TOOL_SESSION_CRITERIA: readonly Criterion[] = [
  {
    id: 'TSS-1',
    statement:
      'A tool session says what happened on the bus under the source of the program that ran it — that it started, what each step did, how it ended — through three topics declared once in the contracts with strict payloads, so whichever program ran the session a subscriber reads one shape.',
  },
  {
    id: 'TSS-2',
    statement:
      'A tool is defined once — a name, what it does, its parameters as a zod object, its effect, whether a person approves each call, and what it runs — and its declaration for the wire is written from that definition; a catalog refuses a name declared twice, answers an unknown tool by name, turns arguments its schema refuses into a refused outcome naming the issues and a tool that throws into a failed one, and cuts every summary to the observation bound; another program’s tools are mounted from its GET /tools and each call sent to its POST /tools/:name, a refusal, an unknown tool and a dead peer each read as what they are.',
  },
  {
    id: 'TSS-3',
    statement:
      'A session decides nothing of its own: the rubric is derived once from the mission and supplied on every run; each step composes the goal within budget, asks the loop for one plan — two iterations when the last plan ran nothing — reads it back by the contracts’ routing, runs the executable prefix in order and stops at the first call that failed or was refused, asks the operator before a call its tool declares approval for and before the question a plan ends on, ends on the mission’s declared cause when a plan finishes, carries what refused a plan as the next goal’s objections and what the evaluator passed as settled criteria, and bounds what it keeps of observations and recent calls; a loop fault, a refused plan, a failed call, a step, a minute, an operator who does not answer and a stop signal each count against a declared rail, and the session ends by the rail’s cause with the status its table declares.',
  },
  {
    id: 'TSS-4',
    statement:
      'A program runs sessions through one registry that keeps each record in memory as it is written, starts a session detached from the request that asked for it, lists and reads them back, stops one by its signal and every one when the program shuts down; its HTTP surface is POST /sessions (202 with the record; 503 naming a peer that cannot be reached), GET /sessions, GET /sessions/:id and POST /sessions/:id/stop (404 by name), GET /tools (the declarations) and POST /tools/:name (the outcome; 400 with issues for arguments the tool refuses, 404 for a tool it does not have).',
  },
  {
    id: 'TSS-5',
    statement:
      'The command line runs one mission from a file to its end, printing each step as it lands, and exits 0 for a session that completed, 1 for one stopped or failed, and 2 for a usage it cannot read.',
  },
  {
    id: 'TSS-6',
    statement:
      'The library is layered — the catalog, the session, the Nest surface, the command line — and each folder reaches another only through its declared door, read from every file’s imports the way the compiler reads them.',
  },
  {
    id: 'TSS-7',
    statement:
      'A session’s settings are one file a program ships — its rails, its recovery windows, how long it waits for the operator, how much of its observations and recent calls it keeps, and the operator’s time zone each goal states the time in — read against one schema that refuses a file with a field missing or wrong by name.',
  },
  {
    id: 'TSS-9',
    statement:
      'The session’s events ride the bus queued one behind another and never awaited by the loop — a slow bus stalls no step, a refused publish is reported and never thrown, and the program flushes the queue as it shuts down; an approval is asked under the source of the program whose tool it is, so a peer’s write is approved on the peer’s own channel, and a notice goes out under the program’s own.',
  },
  {
    id: 'TSS-8',
    statement:
      'What the operator is asked is the notifications contracts’ prompt: an approval offers yes and no and nothing else, a question offers the plan’s options as choices and the person’s own words, and either carries the session as its origin; the answer is read back as the option chosen, the words typed, or the command to stop; and a session that ended is told as one notice.',
  },
];
