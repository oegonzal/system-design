import { Migration } from '@mikro-orm/migrations';

export class Migration20261016071141_create_memory_design_cycle extends Migration {

  override name = 'Migration20261016071141_create_memory_design_cycle';

  override up(): void | Promise<void> {
    this.addSql(`create table "memory_design_cycle" ("id" uuid not null, "session_id" varchar(80) not null, "status" varchar(20) not null, "design_run_id" varchar(80) null, "orchestration_run_id" varchar(80) null, "note" text null, "started_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "memory_design_cycle_started_at_index" on "memory_design_cycle" ("started_at");`);
    this.addSql(`create index "memory_design_cycle_session_id_index" on "memory_design_cycle" ("session_id");`);

    this.addSql(`alter table "memory_design_cycle" add constraint "memory_design_cycle_status_check" check (status in ('running', 'coached', 'stored', 'failed'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "memory_design_cycle" cascade;`);
  }

}
