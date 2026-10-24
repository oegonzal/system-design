import { Migration } from '@mikro-orm/migrations';

/**
 * A SAM.gov registrant's own website, as its registration carries it: the
 * door to a prime's supplier pages. Null for every registrant stored before
 * this, until its next lookup.
 */
export class Migration20261023100001_govcon_entity_website extends Migration {
  override name = 'Migration20261023100001_govcon_entity_website';

  override up(): void | Promise<void> {
    this.addSql(`alter table "govcon_entity" add column "website" text null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "govcon_entity" drop column "website";`);
  }
}
