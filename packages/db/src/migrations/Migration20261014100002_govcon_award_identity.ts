import { Migration } from '@mikro-orm/migrations';

/**
 * An award keeps its own identity: the contract id as the source spells it
 * (the PIID), the award's type as the source names it, and the day
 * performance began beside the day it was signed. All three are nullable:
 * rows stored before this migration carry none until they are fetched again,
 * and a USAspending row's `signed_at` stays the start of performance until
 * then — the adapter now reads the base obligation date.
 */
export class Migration20261014100002_govcon_award_identity extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`
      alter table "govcon_award"
        add column "piid"          text         null,
        add column "award_type"    varchar(40)  null,
        add column "pop_start_at"  date         null;
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`
      alter table "govcon_award"
        drop column if exists "pop_start_at",
        drop column if exists "award_type",
        drop column if exists "piid";
    `);
  }
}
