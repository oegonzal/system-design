import { Migration } from '@mikro-orm/migrations';

/**
 * A revision whose grade the studio itself had to call off — the grader no
 * longer has the run that was grading it — records why, in the author's
 * terms, beside the terminal `failed` it is cached with: a list or a timeline
 * says what happened without asking the grader. Null on every row that
 * exists, and on every grade the grader reported itself.
 */
export class Migration20261002100004_design_revision_evaluation_error extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "design_revision" add column "evaluation_error" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "design_revision" drop column if exists "evaluation_error";`);
  }
}
