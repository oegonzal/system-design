import type { ApiResponse } from '../envelope';
import type { Bid } from './bid';
import type { Lead } from './lead';
import type { Description } from './source';

/** `GET /notices/:noticeId`: the lead plus everything stored about the notice. */
export interface NoticeDto extends Lead {
  description: Description | null;
  /** The notice's place in the pipeline, when it has one. */
  bid: Bid | null;
}

export type GetNoticeResponse = ApiResponse<NoticeDto>;
