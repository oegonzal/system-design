import { Migration } from '@mikro-orm/migrations';

/**
 * A confirmed finding carries the first rationale a critic gave for it, so a
 * reader of the run — the studio's feedback panel, the coach's remediation
 * notes — sees why without re-deriving the join from the raw reports. Prose
 * for a reader only: the controller reads the structural columns beside it.
 */
export class Migration20260929100002_quality_run_finding_rationale extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "quality_run_finding" add column "rationale" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "quality_run_finding" drop column if exists "rationale";`);
  }
}
