import { Migration } from '@mikro-orm/migrations';

/**
 * A coaching run remembers what the studio last saw of it — `running` until
 * a read observes it finished, then terminal — so a session read asks the
 * grader only while a run may still hold the session. Rows that exist start
 * `running`: the first read asks the loop once and records the truth.
 */
export class Migration20261001100001_coaching_run_status extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "coaching_run" add column "status" text not null default 'running';`,
    );
    this.addSql(`
      alter table "coaching_run"
        add constraint "coaching_run_status_check"
        check (status in ('running', 'complete', 'failed'));
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "coaching_run" drop constraint if exists "coaching_run_status_check";`);
    this.addSql(`alter table "coaching_run" drop column if exists "status";`);
  }
}
