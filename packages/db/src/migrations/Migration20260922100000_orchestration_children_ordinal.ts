import { Migration } from '@mikro-orm/migrations';

/**
 * A step may open several child runs — a panel runs one pipeline several
 * times — so a child row is keyed by step and ordinal rather than by step
 * alone. The ledger's shape moves with it: every step carries `runIds` (in
 * the order they opened) in place of one `runId`, and a `report` slot for
 * what a step says beyond counts; the request records how many `samples`
 * were asked for. Existing rows are rewritten in place — one child becomes
 * ordinal zero, one id becomes a one-element list — so nothing recorded is
 * lost and no reader keeps two shapes.
 */
export class Migration20260922100000_orchestration_children_ordinal extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "orchestration_run_child" drop constraint "orchestration_run_child_run_id_step_unique";`,
    );
    this.addSql(`alter table "orchestration_run_child" add column "ordinal" int not null default 0;`);
    this.addSql(
      `alter table "orchestration_run_child" add constraint "orchestration_run_child_run_id_step_ordinal_unique" unique ("run_id", "step", "ordinal");`,
    );

    // The ledger: `runId` → `runIds`, plus `report`. A step with no child keeps
    // an empty list; coalesce because aggregating an empty ledger yields null.
    this.addSql(`
      update "orchestration_run" set "steps" = coalesce((
        select jsonb_object_agg(
          key,
          (value - 'runId') || jsonb_build_object(
            'runIds', case when value ->> 'runId' is null then '[]'::jsonb else jsonb_build_array(value -> 'runId') end,
            'report', null
          )
        )
        from jsonb_each("steps")
      ), '{}'::jsonb);
    `);
    this.addSql(`update "orchestration_run" set "request" = "request" || '{"samples": null}'::jsonb;`);
  }

  override down(): void | Promise<void> {
    // The old key cannot hold a second child per step; only the first survives.
    this.addSql(`delete from "orchestration_run_child" where "ordinal" > 0;`);
    this.addSql(`
      update "orchestration_run" set "steps" = coalesce((
        select jsonb_object_agg(
          key,
          (value - 'runIds' - 'report') || jsonb_build_object('runId', coalesce(value -> 'runIds' -> 0, 'null'::jsonb))
        )
        from jsonb_each("steps")
      ), '{}'::jsonb);
    `);
    this.addSql(`update "orchestration_run" set "request" = "request" - 'samples';`);
    this.addSql(
      `alter table "orchestration_run_child" drop constraint "orchestration_run_child_run_id_step_ordinal_unique";`,
    );
    this.addSql(`alter table "orchestration_run_child" drop column "ordinal";`);
    this.addSql(
      `alter table "orchestration_run_child" add constraint "orchestration_run_child_run_id_step_unique" unique ("run_id", "step");`,
    );
  }
}
