import { Migration } from '@mikro-orm/migrations';

/**
 * Liveness for the two run tables (ENG-10). A running row is another
 * process's until its heartbeat goes stale; a boot no longer fails every
 * `running` row it finds. Existing rows take their last update as the
 * heartbeat, so anything left running by a dead process is sweepable at the
 * next boot exactly as before.
 */
export class Migration20260929300001_run_heartbeat extends Migration {
  override up(): void | Promise<void> {
    for (const table of ['quality_run', 'orchestration_run']) {
      this.addSql(`alter table "${table}" add column "heartbeat_at" timestamptz null;`);
      this.addSql(`update "${table}" set "heartbeat_at" = "updated_at";`);
      this.addSql(`alter table "${table}" alter column "heartbeat_at" set not null;`);
    }
  }

  override down(): void | Promise<void> {
    for (const table of ['orchestration_run', 'quality_run']) {
      this.addSql(`alter table "${table}" drop column if exists "heartbeat_at";`);
    }
  }
}
