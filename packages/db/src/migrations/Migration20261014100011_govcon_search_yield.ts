import { Migration } from '@mikro-orm/migrations';

/**
 * What a saved search brought in the last time it read the source: how many
 * records, how many of them new, and how the profile ranked what it carried.
 * Kept on the search so one can be kept in the daily pull, or dropped from
 * it, on evidence.
 */
export class Migration20261014100011_govcon_search_yield extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "govcon_saved_search" add column "last_yield" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "govcon_saved_search" drop column "last_yield";`);
  }
}
