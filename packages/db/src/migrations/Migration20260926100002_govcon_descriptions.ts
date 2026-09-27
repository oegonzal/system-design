import { Migration } from '@mikro-orm/migrations';

/**
 * Notice descriptions and the ledger's operation. A description is one
 * budgeted request per notice, so once fetched it is kept on the row
 * (`description_text` for reading, `description_raw` as received). Every
 * ledger row now says what it was — a search page or a description — because
 * both spend the budget but only searches answer the cache; existing rows are
 * searches, hence the temporary default.
 */
export class Migration20260926100002_govcon_descriptions extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "govcon_opportunity"
        add column "description_text"       text         null,
        add column "description_raw"        jsonb        null,
        add column "description_fetched_at" timestamptz  null;
    `);
    this.addSql(
      `alter table "govcon_source_call" add column "operation" varchar(20) not null default 'search';`,
    );
    this.addSql(`alter table "govcon_source_call" alter column "operation" drop default;`);
    this.addSql(`
      alter table "govcon_source_call"
        add constraint "govcon_source_call_operation_check"
        check (operation in ('search', 'description'));
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "govcon_source_call" drop constraint if exists "govcon_source_call_operation_check";`,
    );
    this.addSql(`alter table "govcon_source_call" drop column if exists "operation";`);
    this.addSql(`
      alter table "govcon_opportunity"
        drop column if exists "description_fetched_at",
        drop column if exists "description_raw",
        drop column if exists "description_text";
    `);
  }
}
