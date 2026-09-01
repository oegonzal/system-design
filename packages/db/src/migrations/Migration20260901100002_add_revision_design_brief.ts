import { Migration } from '@mikro-orm/migrations';

/**
 * A revision now carries the author's design brief: which components hold each
 * requirement, and how a request travels. It is the graded half of explaining a
 * design, and it lives beside the graph for the same reason the graph does —
 * an immutable snapshot of what was submitted.
 *
 * Nullable rather than defaulted: revisions submitted before this have no
 * brief, and that is a fact worth storing rather than papering over with an
 * empty one. The entity supplies `null` in TypeScript, so no SQL default
 * exists to drift against `migration:check`.
 */
export class Migration20260901100002_add_revision_design_brief extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "design_revision"
        add column "brief" jsonb null;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      alter table "design_revision"
        drop column "brief";
    `);
  }
}
