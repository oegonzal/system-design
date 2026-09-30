import { Migration } from '@mikro-orm/migrations';

/**
 * The opportunity row keeps only what is read. `raw` and `description_raw`
 * were the provider's payloads as received — never read by any layer, a
 * second copy of every contact's name and email, and a re-pull or a
 * description re-fetch recreates them for one request each. The NAICS and
 * set-aside indexes served no query; the ranking's one query (open notices,
 * newest first) gets a partial index instead.
 */
export class Migration20260929200002_govcon_opportunity_columns extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "govcon_opportunity"
        drop column "raw",
        drop column "description_raw";
    `);
    this.addSql(`drop index "govcon_opportunity_naics_code_index";`);
    this.addSql(`drop index "govcon_opportunity_set_aside_code_index";`);
    this.addSql(
      `create index "govcon_opportunity_open_index" on "govcon_opportunity" ("posted_at" desc) where active is distinct from false;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists "govcon_opportunity_open_index";`);
    this.addSql(
      `create index "govcon_opportunity_naics_code_index" on "govcon_opportunity" ("naics_code");`,
    );
    this.addSql(
      `create index "govcon_opportunity_set_aside_code_index" on "govcon_opportunity" ("set_aside_code");`,
    );
    this.addSql(`
      alter table "govcon_opportunity"
        add column "raw" jsonb null,
        add column "description_raw" jsonb null;
    `);
  }
}
