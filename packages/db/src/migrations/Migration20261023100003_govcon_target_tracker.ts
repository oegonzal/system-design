import { Migration } from '@mikro-orm/migrations';

/**
 * The rest of the tracker a target keeps: what to do next, the pages kept
 * on it, and the log of what was done about it. Every existing row starts
 * with nothing to do, no links and an empty log; the defaults that fill them
 * are dropped once they have, since every save writes every field.
 */
export class Migration20261023100003_govcon_target_tracker extends Migration {
  override name = 'Migration20261023100003_govcon_target_tracker';

  override up(): void | Promise<void> {
    this.addSql(`alter table "govcon_target" add column "next_action" text not null default '';`);
    this.addSql(`alter table "govcon_target" add column "links" jsonb not null default '[]'::jsonb;`);
    this.addSql(`alter table "govcon_target" add column "activity" jsonb not null default '[]'::jsonb;`);
    this.addSql(`alter table "govcon_target" alter column "next_action" drop default;`);
    this.addSql(`alter table "govcon_target" alter column "links" drop default;`);
    this.addSql(`alter table "govcon_target" alter column "activity" drop default;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "govcon_target" drop column "activity";`);
    this.addSql(`alter table "govcon_target" drop column "links";`);
    this.addSql(`alter table "govcon_target" drop column "next_action";`);
  }
}
