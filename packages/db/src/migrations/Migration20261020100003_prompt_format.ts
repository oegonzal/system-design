import { Migration } from '@mikro-orm/migrations';

/**
 * A prompt carries the shape of practice it asks for (`PRACTICE_FORMATS` in
 * contracts), fixed with its text once a session exists. Every prompt stored
 * before practised the whole system, which is the default. A generation in
 * flight remembers the format it was asked for, copied to the prompt on
 * claim.
 */
const FORMATS = ['system', 'model', 'boundaries', 'workflow', 'evolution'] as const;

export class Migration20261020100003_prompt_format extends Migration {
  override name = 'Migration20261020100003_prompt_format';

  override up(): void | Promise<void> {
    this.addSql(`alter table "prompt" add column "format" text not null default 'system';`);
    this.addSql(
      `alter table "prompt" add constraint "prompt_format_check" check (format in (${FORMATS.map((f) => `'${f}'`).join(', ')}));`,
    );
    this.addSql(
      `alter table "prompt_generation" add column "format" text not null default 'system';`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "prompt_generation" drop column "format";`);
    this.addSql(`alter table "prompt" drop constraint "prompt_format_check";`);
    this.addSql(`alter table "prompt" drop column "format";`);
  }
}
