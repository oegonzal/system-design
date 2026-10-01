'use client';

import { readFailureOf, UNREACHABLE_COPY } from '@sysdesign/web-kit';

import { FullPageNotice } from './full-page-notice';

/** Where a dead end leads, and what the way out says. */
export interface NoticeExit {
  href: string;
  label: string;
}

export interface LoadFailureNoticeProps {
  /** What the page shows, as a reader names it: `prompt`, `STAR story`, `practice session`. */
  noun: string;
  /** What the read of it threw. */
  error: unknown;
  /** Read it again — offered only when another try could succeed. */
  onRetry: () => void;
  /** The way out of the dead end. */
  exit: NoticeExit;
}

const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * The one way a page that reads a resource by its id says it could not.
 * `readFailureOf` decides: nothing lives at the address — a 404, or an id
 * that cannot name anything — is "not found" with only the way out, because
 * reading again changes nothing; anything else is "couldn't load" with a
 * Retry, in the server's words or, when it never answered, in ours — never
 * the browser's `Failed to fetch`.
 */
export function LoadFailureNotice({ noun, error, onRetry, exit }: LoadFailureNoticeProps) {
  const failure = readFailureOf(error, UNREACHABLE_COPY);
  return failure.kind === 'missing' ? (
    <FullPageNotice
      title={`${capitalized(noun)} not found`}
      message={`This ${noun} doesn't exist. It may have been deleted, or the link may be wrong.`}
      backHref={exit.href}
      backLabel={exit.label}
    />
  ) : (
    <FullPageNotice
      title={`Couldn't load this ${noun}`}
      message={failure.message}
      onRetry={onRetry}
      backHref={exit.href}
      backLabel={exit.label}
    />
  );
}
