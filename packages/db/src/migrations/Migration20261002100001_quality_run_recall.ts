import { Migration } from '@mikro-orm/migrations';

/**
 * A run that asks to recall lessons before it produces records what came of
 * it — `recalling` from the moment it opens, then recalled, empty or skipped
 * with the reason, the memory-recall run that curated the lessons and the
 * lessons the producer was handed. Null on every run that did not ask, which
 * is every row that exists.
 */
export class Migration20261002100001_quality_run_recall extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "quality_run" add column "recall" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "quality_run" drop column if exists "recall";`);
  }
}
