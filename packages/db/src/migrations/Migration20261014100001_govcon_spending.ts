import { Migration } from '@mikro-orm/migrations';

const EARLIER_OPERATIONS = [
  'search',
  'description',
  'attachment',
  'awards',
  'spending',
  'entity',
  'exclusions',
];
const SPENDING_OPERATIONS = [
  'series',
  'breakdown',
  'horizon',
  'agency-budget',
  'agency-offices',
  'agency-directory',
  'freshness',
];
const quoted = (words: readonly string[]): string => words.map((word) => `'${word}'`).join(', ');

/**
 * Spending research over USAspending. The snapshot table keeps one lens
 * answer per canonical query — the day's cache, and what is served as stale
 * when a refresh fails; freshness is decided at read time from `fetched_at`,
 * so there is no expiry column and nothing sweeps the table. The ledger's
 * operation check admits the seven USAspending endpoints the lenses spend
 * through, one operation each.
 */
export class Migration20261014100001_govcon_spending extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "govcon_spending_snapshot" (
        "lens"        varchar(20)  not null,
        "query_key"   varchar(64)  not null,
        "query"       jsonb        not null,
        "fetched_at"  timestamptz  not null,
        "as_of"       date         null,
        "requests"    int          not null,
        "payload"     jsonb        not null,
        constraint "govcon_spending_snapshot_pkey" primary key ("lens", "query_key"),
        constraint "govcon_spending_snapshot_lens_check"
          check (lens in ('pulse', 'breakdown', 'horizon', 'agencies', 'agency', 'freshness'))
      );
    `);
    this.addSql(
      `alter table "govcon_source_call" drop constraint "govcon_source_call_operation_check";`,
    );
    this.addSql(`
      alter table "govcon_source_call"
        add constraint "govcon_source_call_operation_check"
        check (operation in (${quoted([...EARLIER_OPERATIONS, ...SPENDING_OPERATIONS])}));
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `delete from "govcon_source_call" where operation in (${quoted(SPENDING_OPERATIONS)});`,
    );
    this.addSql(
      `alter table "govcon_source_call" drop constraint if exists "govcon_source_call_operation_check";`,
    );
    this.addSql(`
      alter table "govcon_source_call"
        add constraint "govcon_source_call_operation_check"
        check (operation in (${quoted(EARLIER_OPERATIONS)}));
    `);
    this.addSql(`drop table if exists "govcon_spending_snapshot" cascade;`);
  }
}
