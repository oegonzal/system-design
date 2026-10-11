import { Migration } from '@mikro-orm/migrations';

/**
 * The notifications service's tables. The bus: an append-only event log
 * ordered by a database sequence, and named subscriptions, each a cursor over
 * some topics. The interactions: one row per prompt put to a person, kept
 * apart from the bus so it outlives the bus's retention, and one row per
 * message a channel sent it as, gone with its prompt.
 */
export class Migration20261011100001_notifications extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "bus_event" (
        "seq"           bigserial     not null,
        "topic"         varchar(80)   not null,
        "source"        varchar(80)   not null,
        "payload"       jsonb         not null,
        "published_at"  timestamptz   not null,
        constraint "bus_event_pkey" primary key ("seq")
      );
    `);
    this.addSql(`create index "bus_event_topic_seq_index" on "bus_event" ("topic", "seq");`);
    this.addSql(`create index "bus_event_published_at_index" on "bus_event" ("published_at");`);

    this.addSql(`
      create table "bus_subscription" (
        "name"        varchar(120)  not null,
        "topics"      text[]        not null,
        "cursor_seq"  bigint        not null,
        "created_at"  timestamptz   not null,
        "pulled_at"   timestamptz   not null,
        constraint "bus_subscription_pkey" primary key ("name"),
        constraint "bus_subscription_topics_check" check (cardinality(topics) > 0)
      );
    `);
    this.addSql(
      `create index "bus_subscription_pulled_at_index" on "bus_subscription" ("pulled_at");`,
    );

    this.addSql(`
      create table "interaction" (
        "id"          uuid          not null,
        "prompt"      jsonb         not null,
        "state"       varchar(20)   not null,
        "outcome"     jsonb         null,
        "opened_at"   timestamptz   not null,
        "expires_at"  timestamptz   not null,
        "closed_at"   timestamptz   null,
        constraint "interaction_pkey" primary key ("id"),
        constraint "interaction_state_check" check (state in ('open', 'answered', 'withdrawn'))
      );
    `);
    this.addSql(
      `create index "interaction_open_expiry_index" on "interaction" ("expires_at") where state = 'open';`,
    );
    this.addSql(
      `create index "interaction_closed_index" on "interaction" ("closed_at") where closed_at is not null;`,
    );

    this.addSql(`
      create table "interaction_delivery" (
        "id"              uuid          not null,
        "interaction_id"  uuid          not null,
        "channel"         varchar(40)   not null,
        "address"         varchar(80)   not null,
        "message_ref"     varchar(80)   not null,
        "delivered_at"    timestamptz   not null,
        "closed_at"       timestamptz   null,
        constraint "interaction_delivery_pkey" primary key ("id")
      );
    `);
    this.addSql(
      `create index "interaction_delivery_interaction_id_index" on "interaction_delivery" ("interaction_id");`,
    );
    this.addSql(`
      alter table "interaction_delivery"
        add constraint "interaction_delivery_channel_address_message_ref_unique"
        unique ("channel", "address", "message_ref");
    `);
    this.addSql(`
      alter table "interaction_delivery"
        add constraint "interaction_delivery_interaction_id_foreign"
        foreign key ("interaction_id") references "interaction" ("id")
        on delete cascade;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "interaction_delivery" cascade;`);
    this.addSql(`drop table if exists "interaction" cascade;`);
    this.addSql(`drop table if exists "bus_subscription" cascade;`);
    this.addSql(`drop table if exists "bus_event" cascade;`);
  }
}
