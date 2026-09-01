import { Migration } from '@mikro-orm/migrations';

/**
 * Profile 2.2.0: a submitted design narrative earns its own scored
 * `communication` dimension, so findings may now carry it.
 */
export class Migration20260831100001_add_communication_dimension extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "finding" drop constraint "finding_dimension_check";
    `);
    this.addSql(`
      alter table "finding"
        add constraint "finding_dimension_check"
        check ("dimension" in ('reliability', 'scalability', 'performance', 'data', 'messaging', 'security', 'hygiene', 'communication'));
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`delete from "finding" where "dimension" = 'communication';`);
    this.addSql(`
      alter table "finding" drop constraint "finding_dimension_check";
    `);
    this.addSql(`
      alter table "finding"
        add constraint "finding_dimension_check"
        check ("dimension" in ('reliability', 'scalability', 'performance', 'data', 'messaging', 'security', 'hygiene'));
    `);
  }
}
