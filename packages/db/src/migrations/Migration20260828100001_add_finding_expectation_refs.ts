import { Migration } from '@mikro-orm/migrations';

/**
 * Engine 2.0.0: findings now trace back to the expectation, NFR, or
 * adversarial scenario that motivated them, and the coverage pass introduces
 * the 'expectation' source (an unmet capability, not a rule violation).
 */
export class Migration20260828100001_add_finding_expectation_refs extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "finding"
        add column "expectation_id" varchar(60) null,
        add column "nfr_id"         varchar(60) null,
        add column "scenario_id"    varchar(40) null;
    `);

    this.addSql(`
      alter table "finding" drop constraint "finding_source_check";
    `);
    this.addSql(`
      alter table "finding"
        add constraint "finding_source_check"
        check ("source" in ('rule', 'expectation', 'llm'));
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`delete from "finding" where "source" = 'expectation';`);
    this.addSql(`
      alter table "finding" drop constraint "finding_source_check";
    `);
    this.addSql(`
      alter table "finding"
        add constraint "finding_source_check"
        check ("source" in ('rule', 'llm'));
    `);
    this.addSql(`
      alter table "finding"
        drop column "expectation_id",
        drop column "nfr_id",
        drop column "scenario_id";
    `);
  }
}
