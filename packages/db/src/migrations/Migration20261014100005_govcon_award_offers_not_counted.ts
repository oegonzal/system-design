import { Migration } from '@mikro-orm/migrations';

/**
 * SAM.gov writes 999 where offers were not counted — measured 2026-10-13 on
 * 466 of 871 stored awards, nearly all GSA schedule records — and the adapter
 * now reads it as unknown. The rows stored before that carry the placeholder
 * as if it were a count, so they are brought to the same reading.
 */
export class Migration20261014100005_govcon_award_offers_not_counted extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `update "govcon_award" set "offers_received" = null where "source" = 'sam.gov' and "offers_received" = 999;`,
    );
  }

  override down(): void | Promise<void> {
    // Nothing to restore: the placeholder said only that no count was kept, which null says too.
  }
}
