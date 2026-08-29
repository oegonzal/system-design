import { Migration } from '@mikro-orm/migrations';

/**
 * The revision's free-text field becomes the design narrative: the author's
 * prose explanation of what each component is for and how they cooperate to
 * meet the requirements, graded alongside the graph. A pure rename — the
 * data, type, and nullability are unchanged.
 */
export class Migration20260829100001_rename_revision_notes_to_narrative extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "design_revision"
        rename column "notes" to "narrative";
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      alter table "design_revision"
        rename column "narrative" to "notes";
    `);
  }
}
