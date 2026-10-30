import { Migration } from '@mikro-orm/migrations';

/**
 * A memory space may carry a name: the one a consumer ensures it under, so the
 * same consumer finds its space again by name rather than by an id it has to
 * keep. No two spaces hold one name — the partial unique index refuses the
 * second — and a space made without a name holds null, which the index leaves
 * out; every space that exists keeps null.
 */
export class Migration20261024010002_memory_space_name extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "memory_space" add column "name" varchar(80) null;`);
    this.addSql(
      `create unique index "memory_space_name_unique" on "memory_space" ("name") where "name" is not null;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists "memory_space_name_unique";`);
    this.addSql(`alter table "memory_space" drop column "name";`);
  }
}
