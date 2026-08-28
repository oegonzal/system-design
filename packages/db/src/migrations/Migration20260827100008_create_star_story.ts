import { Migration } from '@mikro-orm/migrations';

/**
 * 8 of 8 — the STAR repository. GIN over tags backs the `tags @> '{tag}'`
 * filter; both foreign keys are `set null` because the story is the user's
 * writing and outlives whatever it referenced.
 */
export class Migration20260827100008_create_star_story extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      create table "star_story" (
        "id"            uuid         not null,
        "title"         varchar(120) not null,
        "situation"     text         not null,
        "task"          text         not null,
        "action"        text         not null,
        "result"        text         not null,
        "tags"          text[]       not null,
        "prompt_id"     uuid         null,
        "experience_id" uuid         null,
        "created_at"    timestamptz  not null,
        "updated_at"    timestamptz  not null,
        constraint "star_story_pkey" primary key ("id")
      );
    `);

    this.addSql(`
      alter table "star_story"
        add constraint "star_story_title_unique" unique ("title");
    `);

    this.addSql(`
      create index "star_story_tags_gin_index" on "star_story" using gin ("tags");
    `);

    this.addSql(`
      alter table "star_story"
        add constraint "star_story_prompt_id_foreign"
        foreign key ("prompt_id") references "prompt" ("id")
        on delete set null;
    `);

    this.addSql(`
      alter table "star_story"
        add constraint "star_story_experience_id_foreign"
        foreign key ("experience_id") references "experience_profile" ("id")
        on delete set null;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "star_story" cascade;`);
  }
}
