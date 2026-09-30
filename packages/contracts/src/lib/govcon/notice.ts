import type { ApiResponse } from '../envelope';
import type { Lead } from './lead';
import type { Description } from './source';

/** `GET /notices/:noticeId`: the lead plus everything stored about the notice. */
export interface NoticeDto extends Lead {
  description: Description | null;
}

export type GetNoticeResponse = ApiResponse<NoticeDto>;
