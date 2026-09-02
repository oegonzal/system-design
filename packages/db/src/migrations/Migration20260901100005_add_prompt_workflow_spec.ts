import { Migration } from '@mikro-orm/migrations';

/**
 * Generator 2.3.0: prompts may carry a machine-readable workflow spec — the
 * business layer the product dimension grades. Nullable, no backfill: an
 * existing prompt without one simply never assesses the dimension.
 */
export class Migration20260901100005_add_prompt_workflow_spec extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "prompt" add column "workflow_spec" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "prompt" drop column "workflow_spec";`);
  }
}
