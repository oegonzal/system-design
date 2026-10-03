import { Migration } from '@mikro-orm/migrations';

/** The width the titles had before this migration, and the most the way back can hold. */
const FORMER_WIDTH = 120;

/**
 * A prompt's and a story's title are bounded by their declarations
 * (`PROMPT_TITLE_BOUND`, `STORY_TITLE_BOUND`: 120 asked, 160 accepted), not
 * by a column width: the contracts accept a title a little over what was
 * asked, and a column of 120 would refuse what the schema kept. `text`, as
 * every other prose column already is, so only the declared bound limits it.
 *
 * Once this is up, a title longer than 120 can be stored, and a cast back to
 * `varchar(120)` would cut it silently. The way back refuses instead while
 * any prompt or story title is longer than that, naming how many, which is
 * the right failure: shortening them is a decision for whoever migrates down.
 */
export class Migration20261003100004_titles_as_text extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "prompt" alter column "title" type text using ("title"::text);`);
    this.addSql(`alter table "star_story" alter column "title" type text using ("title"::text);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`do $$
declare
  prompts integer;
  stories integer;
begin
  select count(*) into prompts from "prompt" where char_length("title") > ${FORMER_WIDTH};
  select count(*) into stories from "star_story" where char_length("title") > ${FORMER_WIDTH};
  if prompts > 0 or stories > 0 then
    raise exception 'titles_as_text down: % prompt and % story titles are longer than ${FORMER_WIDTH}; varchar(${FORMER_WIDTH}) would cut them', prompts, stories;
  end if;
end $$;`);
    this.addSql(
      `alter table "prompt" alter column "title" type varchar(${FORMER_WIDTH}) using ("title"::varchar(${FORMER_WIDTH}));`,
    );
    this.addSql(
      `alter table "star_story" alter column "title" type varchar(${FORMER_WIDTH}) using ("title"::varchar(${FORMER_WIDTH}));`,
    );
  }
}
