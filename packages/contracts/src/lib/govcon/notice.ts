import type { ApiResponse } from '../envelope';
import type { Award, AwardsSummary } from './award';
import type { Bid } from './bid';
import type { Lead } from './lead';
import type { Description } from './source';

/**
 * One attachment of a notice. SAM.gov serves these without a key — the link
 * answers a redirect to a short-lived file URL — so the client links to it
 * directly and nothing is spent or proxied.
 */
export interface Attachment {
  /** Position in the notice's `resourceLinks`. */
  ordinal: number;
  url: string;
}

/** `GET /notices/:noticeId`: the lead plus everything stored about the notice. */
export interface NoticeDto extends Lead {
  description: Description | null;
  attachments: Attachment[];
  /** The notice's place in the pipeline, when it has one. */
  bid: Bid | null;
  awards: NoticeAwards;
}

/** What the stored awards say about a notice: its own solicitation, then its NAICS inside the profile's history window. */
export interface NoticeAwards {
  bySolicitation: Award[];
  related: AwardsSummary;
}

export type GetNoticeResponse = ApiResponse<NoticeDto>;
