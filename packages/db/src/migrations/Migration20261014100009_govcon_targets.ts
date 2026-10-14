import { Migration } from '@mikro-orm/migrations';

const EARLIER_KINDS = ['award-ending', 'pulse-above-band'];
const TARGET_KINDS = ['award-end-moved', 'award-notice'];
/** Every kind, in the order the vocabulary declares them — the check is compared as text. */
const KINDS = ['award-ending', ...TARGET_KINDS, 'pulse-above-band'];
const quoted = (words: readonly string[]): string => words.map((word) => `'${word}'`).join(', ');

/**
 * Targets, and the alerts that follow them. A target is a firm or an award
 * the company pursues, one row per kind and subject, with each kind's own
 * stages. The daily warm reads the tracked awards and raises two more kinds
 * of alert about them, so the alert check admits those; an alert found on a
 * target has no scope, so `scope_key` may be null; and the alert keeps what
 * was published and its place among the alerts raised with it, so the
 * alerts of one warm read back as the lines a person was sent, in the order
 * they were sent.
 */
export class Migration20261014100009_govcon_targets extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "govcon_target" (
        "id"                uuid          not null,
        "kind"              varchar(10)   not null,
        "subject"           text          not null,
        "label"             varchar(200)  not null,
        "stage"             varchar(20)   not null,
        "notes"             text          not null,
        "contact"           varchar(300)  not null,
        "reminder_at"       timestamptz   null,
        "ends_at"           date          null,
        "stage_changed_at"  timestamptz   not null,
        "created_at"        timestamptz   not null,
        "updated_at"        timestamptz   not null,
        constraint "govcon_target_pkey" primary key ("id"),
        constraint "govcon_target_kind_subject_unique" unique ("kind", "subject"),
        constraint "govcon_target_kind_check" check (kind in ('firm', 'award')),
        constraint "govcon_target_stage_check" check (
          (kind = 'firm' and stage in ('identified', 'contacted', 'talking', 'teamed', 'passed'))
          or (kind = 'award' and stage in ('watching', 'researching', 'positioning', 'pursuing', 'passed'))
        )
      );
    `);
    this.addSql(
      `create index "govcon_target_reminder_index" on "govcon_target" ("reminder_at") where reminder_at is not null;`,
    );
    this.kindCheck(KINDS);
    this.addSql(`alter table "govcon_alert" alter column "scope_key" drop not null;`);
    this.addSql(`alter table "govcon_alert" add column "payload" jsonb null;`);
    this.addSql(`alter table "govcon_alert" add column "position" int not null default 0;`);
  }

  override down(): void | Promise<void> {
    // An alert of a kind the earlier check refuses, or with no scope, cannot be kept by the earlier table.
    this.addSql(
      `delete from "govcon_alert" where kind in (${quoted(TARGET_KINDS)}) or scope_key is null;`,
    );
    this.addSql(`alter table "govcon_alert" drop column "position";`);
    this.addSql(`alter table "govcon_alert" drop column "payload";`);
    this.addSql(`alter table "govcon_alert" alter column "scope_key" set not null;`);
    this.kindCheck(EARLIER_KINDS);
    this.addSql(`drop table if exists "govcon_target" cascade;`);
  }

  private kindCheck(kinds: readonly string[]): void {
    this.addSql(`alter table "govcon_alert" drop constraint if exists "govcon_alert_kind_check";`);
    this.addSql(
      `alter table "govcon_alert" add constraint "govcon_alert_kind_check" check (kind in (${quoted(kinds)}));`,
    );
  }
}
