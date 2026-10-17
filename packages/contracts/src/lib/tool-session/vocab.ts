/**
 * The tool session's closed vocabularies. Nothing here names a tool or a
 * service: a session is a mission driven over whatever tools a program
 * declares, and these are the words its plans, its records and its routing
 * share.
 */

/** One plan of tool calls over a declared tool index, for the state in front of a tool session. */
export const TOOL_STEP_PIPELINE_ID = 'tool-step';

/**
 * What a tool does to the world, declared by the program that offers it:
 * a read changes nothing; a write changes what a later call can read back;
 * an irreversible call changes what no later call can undo.
 */
export const TOOL_EFFECT_KINDS = ['read', 'write', 'irreversible'] as const;
export type ToolEffectKind = (typeof TOOL_EFFECT_KINDS)[number];

/** How one call ended: its result observed; the tool failed; the call was refused before it ran; it never ran. */
export const CALL_OUTCOMES = ['ok', 'failed', 'refused', 'not-executed'] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/**
 * Whether a call that ended so may be sent again unchanged: a result answers
 * the call, a failure or a refusal does not, so the same call with the same
 * arguments asks the tool the question it has refused. The limits validator
 * cuts the repeat; one declared table says which outcomes it cuts.
 */
export const CALL_OUTCOME_REPEATS = {
  ok: 'allowed',
  failed: 'cut',
  refused: 'cut',
  'not-executed': 'allowed',
} as const satisfies Record<CallOutcome, 'allowed' | 'cut'>;

/** A tool's name as a program declares it: lower-case words joined by underscores, the shape a model copies exactly. */
export const TOOL_NAME = /^[a-z][a-z0-9_]*$/;
export const TOOL_NAME_MAX_LENGTH = 60;
export const TOOL_DESCRIPTION_MAX_LENGTH = 300;
/** What an observation is cut to when a goal would not fit the budget with every result whole. */
export const OBSERVATION_EXCERPT_MAX_LENGTH = 1_500;
/** The most of a tool's result a session keeps as the observation a plan reads. */
export const OBSERVATION_RESULT_MAX_LENGTH = 4_000;
/** How a session names itself as the origin of a prompt, whichever program runs it. */
export const TOOL_SESSION_ORIGIN_KIND = 'tool-session';

export const TOOL_SESSION_STATUSES = ['running', 'complete', 'stopped', 'failed'] as const;
export type ToolSessionStatus = (typeof TOOL_SESSION_STATUSES)[number];

/** The statuses a session ends in: a mission's stop leaves `complete` or `stopped` as it declares, a rail what its table says. */
export const TOOL_SESSION_FINAL_STATUSES = [
  'complete',
  'stopped',
  'failed',
] as const satisfies readonly ToolSessionStatus[];
export type ToolSessionFinalStatus = (typeof TOOL_SESSION_FINAL_STATUSES)[number];

/**
 * Why the engine ends a session on its own: a declared rail, the operator, or
 * a fault. A mission's stop ends a session by its own cause word, which is
 * never one of these.
 */
export const TOOL_SESSION_RAILS = [
  'step-limit',
  'time-limit',
  /** The declared number of plans in a row were refused or ran nothing. */
  'stalled',
  /** The declared number of calls in a row failed or were refused. */
  'tools-failing',
  /** The loop could not be asked, or answered nothing usable, the declared number of times in a row. */
  'loop-faulted',
  /** The operator did not answer an approval or a question before it expired, or could not be reached. */
  'operator-unavailable',
  /** The session was told to stop by its program or its operator. */
  'stop-signal',
  'error',
] as const;
export type ToolSessionRail = (typeof TOOL_SESSION_RAILS)[number];

/** The status each rail leaves the session in. Exhaustive, so a new rail is classified where it is declared. */
export const TOOL_SESSION_RAIL_STATUS = {
  'step-limit': 'stopped',
  'time-limit': 'stopped',
  stalled: 'stopped',
  'tools-failing': 'stopped',
  'loop-faulted': 'stopped',
  'operator-unavailable': 'stopped',
  'stop-signal': 'stopped',
  error: 'failed',
} as const satisfies Record<ToolSessionRail, ToolSessionFinalStatus>;
