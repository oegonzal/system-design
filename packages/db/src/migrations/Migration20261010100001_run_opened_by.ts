import { Migration } from '@mikro-orm/migrations';

const TABLES = ['quality_run', 'orchestration_run'] as const;
/** In the contracts' declared order, so the schema check reads no difference. */
const KINDS = ['browser-session'];
/** As the entities write it: Postgres stores a one-item `in` as `=`, and `= any` as written. */
const check = `check (opened_by_kind is null or opened_by_kind = any (array[${KINDS.map((k) => `'${k}'`).join(', ')}]))`;

/**
 * A run or an orchestration records who opened it, as its caller said — a
 * kind, the caller's own id and what the record was to it — so a browser
 * session's runs can be listed together. The id is indexed for that list.
 * Null on every record that exists: nobody said before this.
 */
export class Migration20261010100001_run_opened_by extends Migration {
  override up(): void | Promise<void> {
    for (const table of TABLES) {
      this.addSql(
        `alter table "${table}" add "opened_by_kind" text null, add "opened_by_id" varchar(80) null, add "opened_by_label" text null;`,
      );
      this.addSql(`alter table "${table}" add constraint "${table}_opened_by_kind_check" ${check};`);
      this.addSql(`create index "${table}_opened_by_id_index" on "${table}" ("opened_by_id");`);
    }
  }

  override down(): void | Promise<void> {
    for (const table of TABLES) {
      this.addSql(`drop index if exists "${table}_opened_by_id_index";`);
      this.addSql(`alter table "${table}" drop constraint if exists "${table}_opened_by_kind_check";`);
      this.addSql(
        `alter table "${table}" drop column if exists "opened_by_kind", drop column if exists "opened_by_id", drop column if exists "opened_by_label";`,
      );
    }
  }
}
