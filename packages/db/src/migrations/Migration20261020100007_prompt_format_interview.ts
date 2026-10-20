import { Migration } from '@mikro-orm/migrations';

/** The practice formats gain `interview`; the prompt's check constraint names every declared format. */
const BEFORE = ['system', 'model', 'boundaries', 'workflow', 'evolution'] as const;
const AFTER = [...BEFORE, 'interview'] as const;

const check = (formats: readonly string[]): string =>
  `alter table "prompt" add constraint "prompt_format_check" check (format in (${formats.map((f) => `'${f}'`).join(', ')}));`;

export class Migration20261020100007_prompt_format_interview extends Migration {
  override name = 'Migration20261020100007_prompt_format_interview';

  override up(): void | Promise<void> {
    this.addSql(`alter table "prompt" drop constraint "prompt_format_check";`);
    this.addSql(check(AFTER));
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "prompt" drop constraint "prompt_format_check";`);
    this.addSql(check(BEFORE));
  }
}
