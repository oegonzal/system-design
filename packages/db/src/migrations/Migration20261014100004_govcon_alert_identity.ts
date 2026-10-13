import { Migration } from '@mikro-orm/migrations';

/**
 * An alert's identity is its kind and its subject. The scope it was found in
 * stays a column — where it was first seen — but no longer part of the key:
 * measured 2026-10-13, the warm reads the horizon through the profile's scope
 * and through each top agency's, and the same expiring award in two of them
 * is one alert to the person who reads the digest.
 */
export class Migration20261014100004_govcon_alert_identity extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "govcon_alert" drop constraint "govcon_alert_kind_subject_scope_key_unique";`,
    );
    this.addSql(
      `alter table "govcon_alert" add constraint "govcon_alert_kind_subject_unique" unique ("kind", "subject");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "govcon_alert" drop constraint "govcon_alert_kind_subject_unique";`);
    this.addSql(
      `alter table "govcon_alert" add constraint "govcon_alert_kind_subject_scope_key_unique" unique ("kind", "subject", "scope_key");`,
    );
  }
}
