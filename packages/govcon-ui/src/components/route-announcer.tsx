'use client';

import { LiveRegion } from '@sysdesign/design-system';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { navItemFor } from '../app/nav';

/**
 * Announces client-side navigations. The region mounts empty on first render
 * — a live region must exist before it has anything to say — and the initial
 * page load is deliberately not announced (screen readers announce the
 * document title themselves).
 */
export function RouteAnnouncer() {
  const pathname = usePathname();
  const [message, setMessage] = useState('');
  const isFirst = useRef(true);

  useEffect(() => {
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect -- announcing is inherently an effect of navigation
    setMessage(`Navigated to ${navItemFor(pathname)?.label ?? pathname}`);
  }, [pathname]);

  return <LiveRegion message={message} />;
}
