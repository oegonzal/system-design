/**
 * Why a call produced no answer, and whether asking again could change that.
 *
 * The port answers `null` on every failure, which is the right contract for a
 * caller but throws away the one fact that decides whether a retry is worth
 * anything. So the adapter classifies first, and the classification is a table
 * over the SDK's own closed vocabularies — `SDKAssistantMessageError` and the
 * result `subtype` — never a search through the provider's prose. A new member
 * of either union lands in `unknown` rather than being guessed at by substring.
 *
 * The split that matters: a retry is worth making when the request was sound
 * and the attempt was not (the provider was busy, the pipe broke, the model
 * wrote the wrong shape), and worth nothing when the request itself is what
 * was rejected. A credential does not become valid in two seconds, and a
 * request that is deterministically invalid fails identically however many
 * times it is sent — retrying those only spends the ceiling and fills the
 * record with the same error.
 */

export const LLM_FAILURE_KINDS = [
  /** A well-formed reply that did not satisfy the schema. */
  'schema-miss',
  /** A reply with no complete JSON object in it at all. */
  'unparseable',
  /** The provider asked us to slow down. */
  'rate-limited',
  /** The provider was busy or faulted on its side. */
  'overloaded',
  /** The turn never reached a result: a spawn that failed, a pipe that broke. */
  'transport',
  /** Our own abort fired: the turn outlived its bound. */
  'timeout',
  /** The credential was refused. */
  'auth',
  /** The request itself was rejected, and would be again. */
  'invalid-request',
  /** A declared spend limit stopped the turn. */
  'budget',
  /** Outside every known name — treated as transient exactly once. */
  'unknown',
] as const;

export type LlmFailureKind = (typeof LLM_FAILURE_KINDS)[number];

/**
 * What the provider said, reduced to the two closed vocabularies plus our own
 * two local conditions. Everything here is a value the SDK hands over or a
 * fact the adapter knows first-hand; none of it is parsed out of a message.
 */
export interface FailureSignal {
  /** The assistant message's `error`, when the turn carried one. */
  assistantError?: string | null;
  /** The result message's `subtype`, when a result arrived. */
  resultSubtype?: string | null;
  /** True when the turn never reached a result. */
  noResult?: boolean;
  /** True when our own abort fired. */
  aborted?: boolean;
  /** True when a reply arrived but did not satisfy the schema. */
  schemaMiss?: boolean;
  /** True when no complete JSON object could be found in the reply. */
  unparseable?: boolean;
}

const BY_ASSISTANT_ERROR: Readonly<Record<string, LlmFailureKind>> = {
  authentication_failed: 'auth',
  oauth_org_not_allowed: 'auth',
  account_on_hold: 'auth',
  billing_error: 'auth',
  rate_limit: 'rate-limited',
  overloaded: 'overloaded',
  server_error: 'overloaded',
  invalid_request: 'invalid-request',
  model_not_found: 'invalid-request',
  max_output_tokens: 'unparseable',
  unknown: 'unknown',
};

const BY_RESULT_SUBTYPE: Readonly<Record<string, LlmFailureKind>> = {
  error_during_execution: 'overloaded',
  error_max_turns: 'overloaded',
  error_max_budget_usd: 'budget',
  error_max_structured_output_retries: 'invalid-request',
};

/** The kind, from the strongest signal available. Order matters: our own facts first. */
export function classifyFailure(signal: FailureSignal): LlmFailureKind {
  if (signal.aborted === true) return 'timeout';
  if (signal.assistantError != null && signal.assistantError in BY_ASSISTANT_ERROR) {
    return BY_ASSISTANT_ERROR[signal.assistantError];
  }
  if (signal.resultSubtype != null && signal.resultSubtype in BY_RESULT_SUBTYPE) {
    return BY_RESULT_SUBTYPE[signal.resultSubtype];
  }
  if (signal.unparseable === true) return 'unparseable';
  if (signal.schemaMiss === true) return 'schema-miss';
  if (signal.noResult === true) return 'transport';
  return 'unknown';
}

export interface LlmRetryPolicy {
  /** Attempts per call, the first included. */
  attempts: number;
  /** Attempts allowed when the bound we set is what stopped the turn; each costs the full bound. */
  timeoutAttempts: number;
  /** Kinds worth asking again about. */
  retryKinds: readonly LlmFailureKind[];
  /** Kinds asked again only once, however many attempts are allowed. */
  onceOnly: readonly LlmFailureKind[];
  /** Pause before asking again, for the kinds that mean "the provider is strained". */
  backoffMs: number;
  maxBackoffMs: number;
}

/**
 * Three attempts, because a sample is expensive to lose and cheap to re-ask
 * for: four of six pipelines confirm a defect only when one lens sees it in
 * two of its own samples, so a lost sample does not merely thin the evidence,
 * it silences that lens entirely.
 *
 * A timeout gets one more ask, not two. A call's limit is its whole declared
 * answer at the slowest pace the model has measurably kept
 * (`callTimeLimitMs`), so outliving it says the attempt was wedged, not that
 * the answer was long — and a wedged attempt is what an immediate retry
 * recovers. Measured on the fixed 300 s cap this replaces (static/runs,
 * 2026-10-02): of the nine calls it cut outside the provider outage, eight
 * answered on the very next ask, six of them validly (4–21k tokens in
 * 45–245 s); the ninth was a coach whose answer was simply longer than the
 * cap, which a declared limit now fits. A third ask after two timeouts
 * recovered none of the five calls that reached one. Those third asks were a
 * mistake besides: the SDK reports our abort as a plain `Error`, so a timeout
 * was read as a broken pipe and given every attempt — whether our own abort
 * fired is now read from its signal.
 */
export const DEFAULT_RETRY_POLICY: LlmRetryPolicy = {
  attempts: 3,
  timeoutAttempts: 2,
  retryKinds: [
    'schema-miss',
    'unparseable',
    'rate-limited',
    'overloaded',
    'transport',
    'timeout',
    'unknown',
  ],
  onceOnly: ['unknown'],
  backoffMs: 1_000,
  maxBackoffMs: 30_000,
};

/** Kinds that mean the provider is strained, so asking again should wait first. */
const STRAINED: readonly LlmFailureKind[] = ['rate-limited', 'overloaded'];

/** Whether a call that failed this way, on this attempt, may be made again. */
export function retryable(
  kind: LlmFailureKind,
  attempt: number,
  policy: LlmRetryPolicy = DEFAULT_RETRY_POLICY,
): boolean {
  if (!policy.retryKinds.includes(kind)) return false;
  if (policy.onceOnly.includes(kind) && attempt >= 2) return false;
  const allowed =
    kind === 'timeout' ? Math.min(policy.timeoutAttempts, policy.attempts) : policy.attempts;
  return attempt < allowed;
}

/** How long to wait before asking again. Only a strained provider is given room. */
export function backoffFor(
  kind: LlmFailureKind,
  attempt: number,
  policy: LlmRetryPolicy = DEFAULT_RETRY_POLICY,
): number {
  if (!STRAINED.includes(kind)) return 0;
  return Math.min(policy.backoffMs * 2 ** (attempt - 1), policy.maxBackoffMs);
}
