'use client';

import { useEffect, useState } from 'react';

/**
 * The wall clock, re-read once a second while `live` and frozen at its last
 * reading once it is not — what an elapsed counter of something in flight
 * ticks from, and what it stops on when the thing ends.
 */
export function useNow(live: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);
  return now;
}
