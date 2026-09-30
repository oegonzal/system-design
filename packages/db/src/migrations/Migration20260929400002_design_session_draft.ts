import { Migration } from '@mikro-orm/migrations';

/** The unsubmitted canvas lives with its session, so a reload or another machine finds it. */
export class Migration20260929400002_design_session_draft extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "design_session" add column "draft" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "design_session" drop column if exists "draft";`);
  }
}
