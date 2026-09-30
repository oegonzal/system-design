import type { SourceAvailability } from '@sysdesign/contracts';

import type { Attempted, Fetched } from '../budget';

/** A notice's description as text — the adapter reduces the provider's markup; nothing downstream renders HTML. */
export interface NoticeDescriptions {
  readonly id: string;
  readonly availability: SourceAvailability;
  get(noticeId: string): Promise<Attempted<Fetched<string>>>;
}
