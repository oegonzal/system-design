import { Migration } from '@mikro-orm/migrations';

/**
 * 1 of 8 — seeded reference data; everything else hangs off it.
 *
 * Migrations carry DDL only, never data: seeding is `scripts/seed.ts`, which
 * is idempotent and safe on every `tilt up`.
 */
export class Migration20260827100001_create_experience_profile extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "experience_profile" (
        "id"            uuid         not null,
        "slug"          varchar(60)  not null,
        "company_label" varchar(80)  not null,
        "title"         varchar(120) not null,
        "summary"       text         not null,
        "archetype"     text         not null,
        "tech_stack"    text[]       not null,
        "scale_facts"   jsonb        not null,
        "highlights"    text[]       not null,
        "created_at"    timestamptz  not null,
        constraint "experience_profile_pkey" primary key ("id"),
        constraint "experience_profile_archetype_check" check ("archetype" in ('flash-sale-ticketing', 'media-streaming-pipeline', 'workflow-automation', 'realtime-analytics', 'dag-orchestration'))
      );
    `);

    this.addSql(`
      alter table "experience_profile"
        add constraint "experience_profile_slug_unique" unique ("slug");
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "experience_profile" cascade;`);
  }
}
