/** How many of the call log's last distinct entries a failure keeps: a retry repeats its reason, then waits. */
const CALL_LOG_TAIL = 3;

/** The call log Playwright attaches to an error it raises, entry by entry; none on any other error. */
const callLogOf = (error: Error): string[] => {
  const log = (error as Error & { log?: unknown }).log;
  return Array.isArray(log)
    ? log.filter((entry): entry is string => typeof entry === 'string')
    : [];
};

/**
 * An action's failure in one line: the error's own first line, then its call
 * log — each entry once, where it last occurred, the last few kept — which
 * says what the action was still waiting for when it gave up. Measured
 * 2026-10-10: a click on a radio answer reported only "Timeout 15000ms
 * exceeded" although it had taken effect, and why it had waited went with
 * the call log.
 */
export const actionFailureOf = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  const first = error.message.split('\n')[0] ?? error.message;
  const entries = callLogOf(error).map((entry) => entry.trim().replace(/^(?:-|\d+ ×)\s*/, ''));
  const lastSeen = entries.filter((entry, at) => entries.lastIndexOf(entry) === at);
  const waitedFor = lastSeen.slice(-CALL_LOG_TAIL).join('; ');
  return waitedFor === '' ? first : `${first} (${waitedFor})`;
};
