import { Migration } from '@mikro-orm/migrations';

/**
 * A prompt's and a story's title are bounded by their declarations
 * (`PROMPT_TITLE_BOUND`, `STORY_TITLE_BOUND`: 120 asked, 160 accepted), not
 * by a column width: the contracts accept a title a little over what was
 * asked, and a column of 120 would refuse what the schema kept. `text`, as
 * every other prose column already is, so only the declared bound limits it.
 * Nothing stored is longer than 120, so the way back loses nothing.
 */
export class Migration20261003100002_titles_as_text extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "prompt" alter column "title" type text using ("title"::text);`);
    this.addSql(`alter table "star_story" alter column "title" type text using ("title"::text);`);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "prompt" alter column "title" type varchar(120) using ("title"::varchar(120));`,
    );
    this.addSql(
      `alter table "star_story" alter column "title" type varchar(120) using ("title"::varchar(120));`,
    );
  }
}
