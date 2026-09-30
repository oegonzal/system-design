import { Migration } from '@mikro-orm/migrations';

/**
 * The ledger counts every attempt and orders reliably. `attempt` numbers the
 * HTTP attempts one logical call made (a retried 5xx is two rows under the
 * same query key); `seq` is a sequence that breaks ties between rows that
 * share a timestamp, so "newest first" is one order. The operation check
 * admits every capability the key reaches; `outcome` becomes a bounded
 * varchar like `operation`. Indexes follow the two reads: the fresh-call
 * lookup (source, key, operation, outcome, newest) and the ledger page
 * (newest, then seq).
 */
export class Migration20260929200001_govcon_ledger_attempts extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "govcon_source_call"
        add column "seq" bigserial not null,
        add column "attempt" smallint not null default 1;
    `);
    this.addSql(`alter table "govcon_source_call" alter column "attempt" drop default;`);
    this.addSql(
      `alter table "govcon_source_call" add constraint "govcon_source_call_seq_unique" unique ("seq");`,
    );
    this.addSql(`alter table "govcon_source_call" alter column "outcome" type varchar(20);`);
    this.addSql(
      `alter table "govcon_source_call" drop constraint "govcon_source_call_operation_check";`,
    );
    this.addSql(`
      alter table "govcon_source_call"
        add constraint "govcon_source_call_operation_check"
        check (operation in ('search', 'description', 'attachment', 'awards', 'spending', 'entity', 'exclusions'));
    `);
    this.addSql(`drop index "govcon_source_call_source_query_key_requested_at_index";`);
    this.addSql(
      `create index "govcon_source_call_fresh_index" on "govcon_source_call" ("source", "query_key", "operation", "outcome", "requested_at" desc);`,
    );
    this.addSql(
      `create index "govcon_source_call_page_index" on "govcon_source_call" ("requested_at" desc, "seq" desc);`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists "govcon_source_call_page_index";`);
    this.addSql(`drop index if exists "govcon_source_call_fresh_index";`);
    this.addSql(
      `create index "govcon_source_call_source_query_key_requested_at_index" on "govcon_source_call" ("source", "query_key", "requested_at");`,
    );
    this.addSql(
      `alter table "govcon_source_call" drop constraint if exists "govcon_source_call_operation_check";`,
    );
    this.addSql(`
      alter table "govcon_source_call"
        add constraint "govcon_source_call_operation_check"
        check (operation in ('search', 'description'));
    `);
    this.addSql(`alter table "govcon_source_call" alter column "outcome" type text;`);
    this.addSql(
      `alter table "govcon_source_call" drop constraint if exists "govcon_source_call_seq_unique";`,
    );
    this.addSql(`
      alter table "govcon_source_call"
        drop column if exists "attempt",
        drop column if exists "seq";
    `);
  }
}
