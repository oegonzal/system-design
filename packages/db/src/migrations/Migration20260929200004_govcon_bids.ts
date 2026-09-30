import { Migration } from '@mikro-orm/migrations';

/**
 * The bid pipeline: one row per stored notice the company is tracking,
 * keyed by the notice and gone with it. The stage backs a check over the
 * package's vocabulary; the reminder index serves "due this week".
 */
export class Migration20260929200004_govcon_bids extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "govcon_bid" (
        "notice_id"         varchar(80)    not null,
        "stage"             varchar(20)    not null,
        "notes"             text           not null,
        "reminder_at"       timestamptz    null,
        "estimated_value"   numeric(16,2)  null,
        "stage_changed_at"  timestamptz    not null,
        "created_at"        timestamptz    not null,
        "updated_at"        timestamptz    not null,
        constraint "govcon_bid_pkey" primary key ("notice_id"),
        constraint "govcon_bid_stage_check"
          check (stage in ('watching', 'qualifying', 'preparing', 'submitted', 'won', 'lost', 'passed'))
      );
    `);
    this.addSql(`
      alter table "govcon_bid"
        add constraint "govcon_bid_notice_id_foreign"
        foreign key ("notice_id") references "govcon_opportunity" ("notice_id")
        on update cascade on delete cascade;
    `);
    this.addSql(`create index "govcon_bid_stage_index" on "govcon_bid" ("stage");`);
    this.addSql(
      `create index "govcon_bid_reminder_index" on "govcon_bid" ("reminder_at") where reminder_at is not null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "govcon_bid" cascade;`);
  }
}
