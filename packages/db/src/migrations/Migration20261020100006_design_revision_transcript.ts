import { Migration } from '@mikro-orm/migrations';

/**
 * A revision submitted from an interview session carries the transcript the
 * studio composed from its turns, so the graders read what was asked and
 * answered beside the design. Null for every other revision.
 */
export class Migration20261020100006_design_revision_transcript extends Migration {
  override name = 'Migration20261020100006_design_revision_transcript';

  override up(): void | Promise<void> {
    this.addSql(`alter table "design_revision" add column "transcript" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "design_revision" drop column "transcript";`);
  }
}
