import { Migration } from '@mikro-orm/migrations';

/**
 * The dimension is renamed because it stopped measuring what its name claimed.
 *
 * `communication` was earned by prose — substring coverage of component labels
 * and requirement keywords. It is now earned by a design brief the engine can
 * corroborate against the diagram, which measures whether the author can point
 * at the components holding each requirement. Writing is still critiqued, but
 * only by the LLM pass, which cannot move the grade.
 *
 * Stored findings are migrated rather than deleted: the lesson each one taught
 * is unchanged, only the bucket's name. `dimension_scores` on old evaluations
 * keeps its old key by design — those were produced by a different profile
 * version, which is what `profileVersion` on the row is for.
 */
export class Migration20260901100003_rename_communication_to_explanation extends Migration {
  // Drop, migrate the rows, then re-add: Postgres validates a check
  // constraint as it is added, so the old values must be gone first.
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "finding" drop constraint "finding_dimension_check";
    `);
    this.addSql(`
      update "finding" set "dimension" = 'explanation' where "dimension" = 'communication';
    `);
    this.addSql(`
      alter table "finding"
        add constraint "finding_dimension_check"
        check ("dimension" in ('reliability', 'scalability', 'performance', 'data', 'messaging', 'security', 'hygiene', 'explanation'));
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      alter table "finding" drop constraint "finding_dimension_check";
    `);
    this.addSql(`
      update "finding" set "dimension" = 'communication' where "dimension" = 'explanation';
    `);
    this.addSql(`
      alter table "finding"
        add constraint "finding_dimension_check"
        check ("dimension" in ('reliability', 'scalability', 'performance', 'data', 'messaging', 'security', 'hygiene', 'communication'));
    `);
  }
}
