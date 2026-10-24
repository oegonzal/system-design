import { Migration } from '@mikro-orm/migrations';

/**
 * A target's one free-text contact becomes a list of named contacts in
 * declared roles. The text a person wrote is kept as the first contact's
 * name, in the role `other`; the column it lived in goes. The default that
 * fills existing rows is dropped once they are filled: every save writes the
 * list. Down keeps only that first name again — the roles, channels and
 * notes have nowhere to go.
 */
export class Migration20261023100002_govcon_target_contacts extends Migration {
  override name = 'Migration20261023100002_govcon_target_contacts';

  override up(): void | Promise<void> {
    this.addSql(`alter table "govcon_target" add column "contacts" jsonb not null default '[]'::jsonb;`);
    this.addSql(`
      update "govcon_target"
      set "contacts" = jsonb_build_array(
        jsonb_build_object('name', "contact", 'role', 'other', 'channel', '', 'note', '')
      )
      where "contact" <> '';
    `);
    this.addSql(`alter table "govcon_target" alter column "contacts" drop default;`);
    this.addSql(`alter table "govcon_target" drop column "contact";`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "govcon_target" add column "contact" varchar(300) not null default '';`);
    this.addSql(
      `update "govcon_target" set "contact" = left(coalesce("contacts"->0->>'name', ''), 300);`,
    );
    this.addSql(`alter table "govcon_target" alter column "contact" drop default;`);
    this.addSql(`alter table "govcon_target" drop column "contacts";`);
  }
}
