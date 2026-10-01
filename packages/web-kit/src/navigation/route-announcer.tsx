'use client';

import { LiveRegion } from '@sysdesign/design-system';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export interface RouteAnnouncerProps {
  /** The name a pathname is announced by; without one, the pathname itself. */
  labelFor: (pathname: string) => string | undefined;
}

/**
 * Announces client-side navigations. The region mounts empty on first render
 * — a live region must exist before it has anything to say — and the initial
 * page load is deliberately not announced (screen readers announce the
 * document title themselves).
 *
 * Every navigation empties the region and then speaks into it on the next
 * task, so two navigations that read the same — `/prompts/a` then
 * `/prompts/b` — are two mutations, and two announcements; setting an
 * identical string would be no change at all.
 */
export function RouteAnnouncer({ labelFor }: RouteAnnouncerProps) {
  const pathname = usePathname();
  const [message, setMessage] = useState('');
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return undefined;
    }
    const announcement = `Navigated to ${labelFor(pathname) ?? pathname}`;
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- announcing is inherently an effect of navigation
    setMessage('');
    const speak = setTimeout(() => setMessage(announcement), 0);
    return () => clearTimeout(speak);
    // Only a navigation announces: `labelFor` is a lookup, and a new identity of it is not one.
  }, [pathname]);

  return <LiveRegion message={message} />;
}
