import { Migration } from '@mikro-orm/migrations';

/** 6 of 8 — individual issues attached to an evaluation. */
export class Migration20260827100006_create_finding extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "finding" (
        "id"                uuid         not null,
        "evaluation_id"     uuid         not null,
        "source"            text         not null,
        "rule_id"           varchar(60)  null,
        "dimension"         text         not null,
        "severity"          text         not null,
        "title"             varchar(120) not null,
        "message"           text         not null,
        "affected_node_ids" text[]       not null,
        "affected_edge_ids" text[]       not null,
        "suggestion"        jsonb        null,
        "created_at"        timestamptz  not null,
        constraint "finding_pkey" primary key ("id"),
        constraint "finding_source_check" check ("source" in ('rule', 'llm')),
        constraint "finding_dimension_check" check ("dimension" in ('reliability', 'scalability', 'performance', 'data', 'messaging', 'security', 'hygiene')),
        constraint "finding_severity_check" check ("severity" in ('critical', 'high', 'medium', 'low', 'info'))
      );
    `);

    this.addSql(`
      create index "finding_evaluation_id_index" on "finding" ("evaluation_id");
    `);

    this.addSql(`
      alter table "finding"
        add constraint "finding_evaluation_id_foreign"
        foreign key ("evaluation_id") references "evaluation" ("id")
        on delete cascade;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "finding" cascade;`);
  }
}
