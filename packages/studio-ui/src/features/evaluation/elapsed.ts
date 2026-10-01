'use client';

import { useEffect, useState } from 'react';

/** `m:ss` — long enough for a grade of several model calls, never wider. */
export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** A once-a-second clock while `live`; frozen once it is not. */
export function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}

/**
 * How long something that started at `since` (an ISO instant the server
 * stamped) has been going, ticking while `live`; null when there is no start.
 */
export function useElapsed(since: string | null, live: boolean): string | null {
  const now = useNow(live && since !== null);
  if (since === null) return null;
  const started = Date.parse(since);
  return Number.isNaN(started) ? null : formatElapsed(now - started);
}
