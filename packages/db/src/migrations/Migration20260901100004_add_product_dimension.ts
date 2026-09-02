import { Migration } from '@mikro-orm/migrations';

/**
 * Profile 3.1.0: prompts that carry a workflow spec grade business
 * workability as its own `product` dimension, so findings may now carry it.
 */
export class Migration20260901100004_add_product_dimension extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "finding" drop constraint "finding_dimension_check";
    `);
    this.addSql(`
      alter table "finding"
        add constraint "finding_dimension_check"
        check ("dimension" in ('reliability', 'scalability', 'performance', 'data', 'messaging', 'security', 'hygiene', 'explanation', 'product'));
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`delete from "finding" where "dimension" = 'product';`);
    this.addSql(`
      alter table "finding" drop constraint "finding_dimension_check";
    `);
    this.addSql(`
      alter table "finding"
        add constraint "finding_dimension_check"
        check ("dimension" in ('reliability', 'scalability', 'performance', 'data', 'messaging', 'security', 'hygiene', 'explanation'));
    `);
  }
}
