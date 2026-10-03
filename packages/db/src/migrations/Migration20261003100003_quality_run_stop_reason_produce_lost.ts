import { Migration } from '@mikro-orm/migrations';

const KEPT = ['accepted', 'rejected', 'escalated', 'plateau', 'max-iterations'];
const check = (reasons: readonly string[]) =>
  `check (stop_reason is null or stop_reason in (${reasons.map((r) => `'${r}'`).join(', ')}))`;

/**
 * `produce-lost` joins the stop reasons: a produce call that answers nothing
 * now spends its iteration rather than the run, and the loop stops for it
 * only once the run has lost more produce calls than its policy allows. The
 * way back refuses to tighten on a database where a run already stopped so,
 * which is the right failure.
 */
export class Migration20261003100003_quality_run_stop_reason_produce_lost extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "quality_run" drop constraint "quality_run_stop_reason_check";`);
    this.addSql(
      `alter table "quality_run" add constraint "quality_run_stop_reason_check" ${check([...KEPT, 'produce-lost'])};`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "quality_run" drop constraint "quality_run_stop_reason_check";`);
    this.addSql(
      `alter table "quality_run" add constraint "quality_run_stop_reason_check" ${check(KEPT)};`,
    );
  }
}
