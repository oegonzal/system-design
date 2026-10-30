import { Migration } from '@mikro-orm/migrations';

/**
 * The teaching reference on a decision row becomes generic: it names whatever
 * the teaching of an operator's answer left behind — an orchestration id
 * today, a memory record id under a memory-backed brain — so the column no
 * longer promises an orchestration. A pure rename — the data, type and
 * nullability are unchanged.
 */
export class Migration20261024010001_browser_decision_teaching_ref extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "browser_decision"
        rename column "teach_orchestration_id" to "teaching_ref";
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      alter table "browser_decision"
        rename column "teaching_ref" to "teach_orchestration_id";
    `);
  }
}
