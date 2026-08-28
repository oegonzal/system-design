import { Migration } from '@mikro-orm/migrations';

/**
 * 2 of 8 — generated prompts. `seed` + `generator_version` make each row
 * reproducible from the pure generator.
 */
export class Migration20260827100002_create_prompt extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "prompt" (
        "id"                          uuid         not null,
        "experience_id"               uuid         not null,
        "archetype"                   text         not null,
        "title"                       varchar(120) not null,
        "scenario"                    text         not null,
        "functional_requirements"     text[]       not null,
        "non_functional_requirements" jsonb        not null,
        "scale_targets"               jsonb        not null,
        "difficulty"                  text         not null,
        "status"                      text         not null default 'active',
        "seed"                        int          not null,
        "generator_version"           varchar(20)  not null,
        "llm_enriched"                boolean      not null default false,
        "created_at"                  timestamptz  not null,
        "updated_at"                  timestamptz  not null,
        constraint "prompt_pkey" primary key ("id"),
        constraint "prompt_difficulty_check" check ("difficulty" in ('intro', 'standard', 'advanced')),
        constraint "prompt_status_check" check ("status" in ('active', 'archived'))
      );
    `);

    this.addSql(`
      create index "prompt_experience_id_index" on "prompt" ("experience_id");
    `);

    this.addSql(`
      create index "prompt_status_index" on "prompt" ("status");
    `);

    // restrict: experiences are seeded reference data; never orphan a prompt.
    this.addSql(`
      alter table "prompt"
        add constraint "prompt_experience_id_foreign"
        foreign key ("experience_id") references "experience_profile" ("id")
        on delete restrict;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "prompt" cascade;`);
  }
}
