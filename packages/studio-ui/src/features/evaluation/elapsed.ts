'use client';

import { formatElapsed, useNow } from '@sysdesign/web-kit/clock';

/**
 * How long something that started at `since` (an ISO instant the server
 * stamped) has been going, ticking while `live`; null when there is no start.
 * The clock and its `m:ss` are web-kit's, so every app counts the same way.
 */
export function useElapsed(since: string | null, live: boolean): string | null {
  const now = useNow(live && since !== null);
  if (since === null) return null;
  const started = Date.parse(since);
  return Number.isNaN(started) ? null : formatElapsed(now - started);
}
