import type { HTMLAttributes } from 'react';

import { VisuallyHidden } from '../visually-hidden/visually-hidden';

export interface LiveRegionProps extends HTMLAttributes<HTMLSpanElement> {
  /** What to announce. Render with an empty message first; then change it. */
  message: string;
  /**
   * `polite` waits for a pause; `assertive` interrupts and maps to
   * `role="alert"`, which should be reserved for errors.
   */
  politeness?: 'polite' | 'assertive';
}

/**
 * An announcement channel.
 *
 * The important part is not the ARIA attributes but the requirement that a
 * live region is **mounted before it has anything to say**. A region inserted
 * into the DOM at the same moment as its content is frequently not announced
 * at all, because screen readers watch existing regions for mutations.
 * Callers should render this unconditionally and change only `message`.
 *
 * `role="status"` already implies `aria-live="polite"`, and `role="alert"`
 * implies `assertive`, so neither is spelled twice.
 */
export function LiveRegion({ message, politeness = 'polite', ...rest }: LiveRegionProps) {
  const role = politeness === 'assertive' ? 'alert' : 'status';

  return (
    <VisuallyHidden role={role} {...rest}>
      {message}
    </VisuallyHidden>
  );
}
