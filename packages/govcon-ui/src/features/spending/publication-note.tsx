import type { PublicationDelay } from '@sysdesign/contracts';
import { Alert } from '@sysdesign/design-system';

const NAMES = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' });

export interface PublicationNoteProps {
  delay: PublicationDelay | null;
  /** What the delay does to the panel it sits in, as one sentence. */
  consequence: string;
}

/**
 * What the source has yet to publish for the scope: who is late, by how
 * long, and the last day that is all in — then what that means here. The
 * service works the day out; the panel only says it. Nothing when nothing
 * is late.
 */
export function PublicationNote({ delay, consequence }: PublicationNoteProps) {
  if (delay === null) return null;
  return (
    <Alert tone="warn">
      {`${NAMES.format(delay.agencies)} awards are published ${delay.days} days after they are signed: everything through ${delay.completeThrough} is in, and later amounts are still filling in. ${consequence}`}
    </Alert>
  );
}
