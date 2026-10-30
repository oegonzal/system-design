import { Migration } from '@mikro-orm/migrations';

/**
 * A memory's kind is no longer a closed list the database holds: the kinds are
 * declared once, in the contract, and a space refuses at compile any kind its
 * runtime has no behavior for — so a write reaches a row only through a
 * register whose kind is declared. A new kind is then an entry in that table
 * and never a migration. The status and lifecycle checks stay.
 */
export class Migration20261030090001_memory_record_open_kinds extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "memory_record" drop constraint if exists "memory_record_kind_check";`);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "memory_record" add constraint "memory_record_kind_check" check (kind in ('working', 'episodic', 'semantic', 'procedural', 'relational'));`,
    );
  }
}
