import { Migration } from '@mikro-orm/migrations';

/**
 * Engine 2.0.0: every evaluation records the profile it was graded under,
 * any grade cap that bound, the LLM axes and scenario reports displayed
 * beside the deterministic score, and the full evidence-artifact trail the
 * aggregator decided from.
 */
export class Migration20260828100002_add_evaluation_evidence extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "evaluation"
        add column "profile_id"      varchar(40) null,
        add column "profile_version" varchar(20) null,
        add column "cap_applied"     jsonb       null,
        add column "evidence"        jsonb       null,
        add column "axes"            jsonb       null,
        add column "scenarios"       jsonb       null;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      alter table "evaluation"
        drop column "profile_id",
        drop column "profile_version",
        drop column "cap_applied",
        drop column "evidence",
        drop column "axes",
        drop column "scenarios";
    `);
  }
}
