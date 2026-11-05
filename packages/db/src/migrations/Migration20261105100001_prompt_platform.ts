import { Migration } from '@mikro-orm/migrations';

/**
 * A prompt declares the platform its design is drawn on — or none — and a
 * generation remembers the one it was asked for until its draft is claimed.
 * Nullable text with no check: the platforms are an open list the contract
 * declares (`PLATFORM_IDS`), as `memory_record.kind` has been since
 * 2026-10-30, so a second platform is a catalogue and never a migration.
 * Every stored prompt is platform-neutral, as every grade read before.
 */
export class Migration20261105100001_prompt_platform extends Migration {
  override name = 'Migration20261105100001_prompt_platform';

  override up(): void | Promise<void> {
    this.addSql(`alter table "prompt" add column "platform" text null;`);
    this.addSql(`alter table "prompt_generation" add column "platform" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "prompt_generation" drop column "platform";`);
    this.addSql(`alter table "prompt" drop column "platform";`);
  }
}
