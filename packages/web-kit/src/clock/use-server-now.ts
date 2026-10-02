'use client';

import { useState } from 'react';

import { useNow } from './use-now';

/** A server stamp as it arrived: the instant it names, and the page's clock when it came. */
interface Anchor {
  stamp: string | null;
  /** The stamp as an instant; null when there is none it can read. */
  server: number | null;
  arrivedAt: number;
}

const anchorOf = (stamp: string | null): Anchor => {
  const server = stamp === null ? Number.NaN : Date.parse(stamp);
  return { stamp, server: Number.isNaN(server) ? null : server, arrivedAt: Date.now() };
};

/**
 * The server's clock, as a page can read it: the last instant the server
 * stamped, advanced by how long the page's own clock says has passed since
 * that stamp arrived — ticking once a second while `live`, frozen once it is
 * not, as `useNow` does. Only a difference of the page's clock is ever added,
 * so however far the page's clock is from the server's, it moves nothing
 * measured against a server stamp; and never less than the stamp itself.
 * Each new stamp re-anchors it in the render that brings it; without one it
 * is the page's own clock.
 */
export function useServerNow(stamp: string | null, live: boolean): number {
  const now = useNow(live);
  const [held, setHeld] = useState(() => anchorOf(stamp));
  let anchor = held;
  if (held.stamp !== stamp) {
    anchor = anchorOf(stamp);
    setHeld(anchor);
  }
  return anchor.server === null ? now : anchor.server + Math.max(0, now - anchor.arrivedAt);
}
