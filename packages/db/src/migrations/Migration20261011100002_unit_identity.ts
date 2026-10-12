import { Migration } from '@mikro-orm/migrations';

/**
 * A unit of work carries the identity its mission declares, and a session
 * carries whom it acted for. `browser_task.facets` holds the declared facts
 * as the plan read them off the page, `browser_session.subject` the name the
 * session was run with — the partition a record beyond the session is kept
 * under. The index on `external_ref` goes: nothing ever issued the lookup it
 * was made for, and a unit's identity across sessions is a domain's, never a
 * URL's. Rows from before carry an empty identity and no subject: the column
 * is added with a default so they fill, and the default dropped again, since
 * the entity itself initialises every new row and the schema diff expects none.
 */
export class Migration20261011100002_unit_identity extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "browser_task" add column "facets" jsonb not null default '[]'::jsonb;`,
    );
    this.addSql(`alter table "browser_task" alter column "facets" drop default;`);
    this.addSql(`drop index "browser_task_external_ref_index";`);
    this.addSql(`alter table "browser_session" add column "subject" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "browser_session" drop column "subject";`);
    this.addSql(`create index "browser_task_external_ref_index" on "browser_task" ("external_ref");`);
    this.addSql(`alter table "browser_task" drop column "facets";`);
  }
}
