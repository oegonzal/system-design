/**
 * A session's sign of life. Its live writes go through the shared write queue
 * (`createWriteQueue`), so a slow database never stalls the browser; the
 * heartbeat is a periodic job of its own (`startPeriodic`), so a long wait on
 * the loop costs no beats, a finished process is not kept alive by it, and a
 * beat in flight is let finish before the session closes.
 */

/** How often a running session beats, and how long a silence a reader takes for death. */
export const SESSION_HEARTBEAT_EVERY_MS = 15_000;
export const SESSION_STALE_AFTER_MS = 60_000;

/** Whether a session that says `running` is still alive, by its beat. */
export const isLive = (heartbeatAt: string, now: Date, staleAfterMs = SESSION_STALE_AFTER_MS) =>
  now.getTime() - Date.parse(heartbeatAt) <= staleAfterMs;
