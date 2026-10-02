import { Migration } from '@mikro-orm/migrations';

/**
 * Which memory run learned from a coach run. A coach run iterates, so its
 * trace carries the transitions a digest reasons over; when one settles the
 * studio hands it to the memory orchestrator, and this column is the record
 * that it did. Null for every row that exists, so each is offered once.
 *
 * It is a column rather than the status transition because two readers observe
 * that transition — the improve poll and the session poll — and either may see
 * it first.
 */
export class Migration20261002100001_coaching_run_digest extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "coaching_run" add column "digest_orchestration_id" varchar(80) null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "coaching_run" drop column if exists "digest_orchestration_id";`);
  }
}
