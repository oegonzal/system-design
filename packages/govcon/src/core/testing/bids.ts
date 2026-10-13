/** Bids in memory, over the notice store's rows. */
import type { BidInput, BidRecord, BidRepository, BidWithNotice, PipelineFilter } from '../ports';
import { InMemoryOpportunityRepository } from './opportunities';

/** Bids over an opportunity repository's rows, so a listing joins the notice the way the store does. */
export class InMemoryBidRepository implements BidRepository {
  readonly rows = new Map<string, BidRecord>();

  constructor(private readonly notices: InMemoryOpportunityRepository) {}

  async find(noticeId: string): Promise<BidRecord | null> {
    return this.rows.get(noticeId) ?? null;
  }

  async save(noticeId: string, input: BidInput, at: Date): Promise<BidRecord> {
    const existing = this.rows.get(noticeId);
    const row: BidRecord = {
      noticeId,
      ...input,
      stageChangedAt: existing && existing.stage === input.stage ? existing.stageChangedAt : at,
      createdAt: existing?.createdAt ?? at,
      updatedAt: at,
    };
    this.rows.set(noticeId, row);
    return row;
  }

  async remove(noticeId: string): Promise<boolean> {
    return this.rows.delete(noticeId);
  }

  async list(filter: PipelineFilter): Promise<[BidWithNotice[], number]> {
    const all = (await this.listAll()).filter(
      (row) => filter.stage === null || row.bid.stage === filter.stage,
    );
    return [all.slice(filter.offset, filter.offset + filter.limit), all.length];
  }

  async listAll(): Promise<BidWithNotice[]> {
    return [...this.rows.values()]
      .flatMap((bid) => {
        const row = this.notices.rows.get(bid.noticeId);
        return row ? [{ bid, opportunity: row.opportunity }] : [];
      })
      .sort(
        (a, b) =>
          b.bid.updatedAt.getTime() - a.bid.updatedAt.getTime() ||
          a.bid.noticeId.localeCompare(b.bid.noticeId),
      );
  }
}
