import { Migration } from '@mikro-orm/migrations';

/**
 * A run opened for another run points back at it: the memory-recall run a
 * run's recall opens records the run it curates lessons for, as that run
 * already names it in `recall`. A self-reference, indexed for "the runs this
 * one opened", set-null on delete so a child outlives a parent removed later.
 * Null on every run that exists: none was opened for another before this.
 */
export class Migration20261002100003_quality_run_parent extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "quality_run" add "parent_run_id" varchar(80) null;`);
    this.addSql(
      `alter table "quality_run" add constraint "quality_run_parent_run_id_foreign" foreign key ("parent_run_id") references "quality_run" ("id") on delete set null;`,
    );
    this.addSql(
      `create index "quality_run_parent_run_id_index" on "quality_run" ("parent_run_id");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "quality_run" drop constraint if exists "quality_run_parent_run_id_foreign";`,
    );
    this.addSql(`drop index if exists "quality_run_parent_run_id_index";`);
    this.addSql(`alter table "quality_run" drop column if exists "parent_run_id";`);
  }
}
