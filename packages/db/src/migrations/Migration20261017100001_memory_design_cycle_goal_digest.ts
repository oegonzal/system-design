import { Migration } from '@mikro-orm/migrations';

/**
 * A memory-design cycle is keyed by the brief it designs for, no longer by a
 * studio session: the column the service has filled with the brief's digest
 * since the cycle took its goal in the request is named for what it holds.
 * Its index served a by-session lookup that no route reaches, and goes with
 * that lookup. A rename — the data, type and nullability are unchanged.
 */
export class Migration20261017100001_memory_design_cycle_goal_digest extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`drop index if exists "memory_design_cycle_session_id_index";`);
    this.addSql(`
      alter table "memory_design_cycle"
        rename column "session_id" to "goal_digest";
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      alter table "memory_design_cycle"
        rename column "goal_digest" to "session_id";
    `);
    this.addSql(
      `create index "memory_design_cycle_session_id_index" on "memory_design_cycle" ("session_id");`,
    );
  }
}
