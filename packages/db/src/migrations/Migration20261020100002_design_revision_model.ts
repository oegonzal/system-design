import { Migration } from '@mikro-orm/migrations';

/**
 * A revision may carry a data model beside its graph, brief and narrative:
 * the entities the design keeps and how they relate. Null for every revision
 * stored before, and for one whose author wrote no model.
 */
export class Migration20261020100002_design_revision_model extends Migration {
  override name = 'Migration20261020100002_design_revision_model';

  override up(): void | Promise<void> {
    this.addSql(`alter table "design_revision" add column "model" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "design_revision" drop column "model";`);
  }
}
