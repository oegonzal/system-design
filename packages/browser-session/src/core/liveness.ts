/**
 * A session's sign of life. A running session writes its beat every
 * `heartbeatEveryMs` (a periodic job of its own, so a long wait on the loop
 * costs no beats); a reader takes a silence past `staleAfterMs` for death —
 * the session that starts next closes such a one as interrupted, and the
 * status command shows it stale. Both are declared on the session settings.
 */
export interface SessionLiveness {
  heartbeatEveryMs: number;
  staleAfterMs: number;
}

/** Whether a session that says `running` is still alive, by its beat. */
export const isLive = (heartbeatAt: string, now: Date, staleAfterMs: number): boolean =>
  now.getTime() - Date.parse(heartbeatAt) <= staleAfterMs;
