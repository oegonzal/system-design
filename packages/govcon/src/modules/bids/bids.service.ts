import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  Bid,
  BidPipelineSummary,
  BidStage,
  PipelineRow,
  SaveBidRequest,
} from '@sysdesign/contracts';

import { summarizePipeline } from '../../core/pipeline';
import type { BidRepository, OpportunityRepository } from '../../core/ports';
import { NO_HISTORY, scoreLead } from '../../core/scoring';
import { toBid } from '../opportunities/opportunities.service';
import { BID_REPOSITORY, OPPORTUNITY_REPOSITORY } from '../opportunities/tokens';
import { ProfilesService } from '../profiles/profiles.service';
import { CLOCK } from '../sources/tokens';

export interface PipelineOptions {
  stage: BidStage | null;
  limit: number;
  offset: number;
}

/**
 * The bid pipeline: one row per stored notice the company tracks. A save is
 * refused before any write when the notice is not stored; omitted fields
 * keep their value; the stage's timestamp moves only with the stage.
 */
@Injectable()
export class BidsService {
  constructor(
    @Inject(BID_REPOSITORY) private readonly bids: BidRepository,
    @Inject(OPPORTUNITY_REPOSITORY) private readonly notices: OpportunityRepository,
    private readonly profiles: ProfilesService,
    @Inject(CLOCK) private readonly now: () => Date,
  ) {}

  async save(noticeId: string, request: SaveBidRequest): Promise<Bid> {
    if ((await this.notices.findOne(noticeId)) === null) {
      throw new NotFoundException(`no stored notice ${noticeId}`);
    }
    const existing = await this.bids.find(noticeId);
    const record = await this.bids.save(
      noticeId,
      {
        stage: request.stage,
        notes: request.notes ?? existing?.notes ?? '',
        reminderAt:
          request.reminderAt === undefined
            ? (existing?.reminderAt ?? null)
            : request.reminderAt === null
              ? null
              : new Date(request.reminderAt),
        estimatedValue:
          request.estimatedValue === undefined
            ? (existing?.estimatedValue ?? null)
            : request.estimatedValue,
      },
      this.now(),
    );
    return toBid(record);
  }

  async remove(noticeId: string): Promise<void> {
    if (!(await this.bids.remove(noticeId)))
      throw new NotFoundException(`no bid on notice ${noticeId}`);
  }

  /** Every tracked notice, scored against the profile, newest change first. */
  async pipeline(
    profileId: string | undefined,
    options: PipelineOptions,
  ): Promise<[PipelineRow[], number]> {
    const profile = await this.profiles.resolve(profileId);
    const context = { nowMs: this.now().getTime(), history: NO_HISTORY };
    const [rows, total] = await this.bids.list(options);
    return [
      rows.map(({ bid, opportunity }) => ({
        bid: toBid(bid),
        lead: scoreLead(opportunity, profile, context),
      })),
      total,
    ];
  }

  async summary(): Promise<BidPipelineSummary> {
    return summarizePipeline(await this.bids.listAll(), this.now().getTime());
  }
}
