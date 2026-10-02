'use client';

import { useCallback, useEffect, useMemo, useRef, type SyntheticEvent } from 'react';

/** Each element the control is described by — its `aria-describedby` IDREF list — that is in the page. */
function describing(control: HTMLElement): HTMLElement[] {
  const ids = control.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
  return ids.flatMap((id) => {
    const element = id.length > 0 ? control.ownerDocument.getElementById(id) : null;
    return element === null ? [] : [element];
  });
}

/**
 * Keeps what describes a field on screen with it while it is used: when a
 * control is focused or typed into, the elements it is described by — a
 * hint under it, the count that appears as its limit nears, the reason it is
 * refused — are scrolled into view by the least move, and then the control
 * itself, so a field taller than the scroller keeps the control. Read after
 * the next frame, so a count the keystroke just brought is in the page.
 *
 * The description is found by `aria-describedby`, the one link every field
 * already carries for assistive technology, so this knows no field's markup.
 * Spread the handlers on the element the fields are inside.
 */
export function useDescriptionInView(): {
  onFocus: (event: SyntheticEvent) => void;
  onInput: (event: SyntheticEvent) => void;
} {
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const reveal = useCallback((event: SyntheticEvent) => {
    const control = event.target;
    if (!(control instanceof HTMLElement)) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (!control.isConnected) return;
      const described = describing(control);
      if (described.length === 0) return;
      for (const element of described) element.scrollIntoView({ block: 'nearest' });
      control.scrollIntoView({ block: 'nearest' });
    });
  }, []);

  return useMemo(() => ({ onFocus: reveal, onInput: reveal }), [reveal]);
}
