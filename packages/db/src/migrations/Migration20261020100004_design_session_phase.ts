import { Migration } from '@mikro-orm/migrations';

/**
 * Interview mode's clock on the session: the format's current phase, when it
 * began, and every phase entered so far with its start and end. Null and
 * empty for a session whose format declares no phases — every session stored
 * before. Recorded, never enforced.
 */
export class Migration20261020100004_design_session_phase extends Migration {
  override name = 'Migration20261020100004_design_session_phase';

  override up(): void | Promise<void> {
    this.addSql(`alter table "design_session" add column "phase" text null;`);
    this.addSql(`alter table "design_session" add column "phase_started_at" timestamptz null;`);
    // Filled for every stored session, then left without a column default:
    // the entity sets the empty log, as it sets every other default.
    this.addSql(
      `alter table "design_session" add column "phase_log" jsonb not null default '[]'::jsonb;`,
    );
    this.addSql(`alter table "design_session" alter column "phase_log" drop default;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "design_session" drop column "phase_log";`);
    this.addSql(`alter table "design_session" drop column "phase_started_at";`);
    this.addSql(`alter table "design_session" drop column "phase";`);
  }
}
