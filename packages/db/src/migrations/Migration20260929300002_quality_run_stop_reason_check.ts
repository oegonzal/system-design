import { Migration } from '@mikro-orm/migrations';

const KEPT = ['accepted', 'rejected', 'escalated', 'plateau', 'max-iterations'];
const check = (reasons: readonly string[]) =>
  `check (stop_reason is null or stop_reason in (${reasons.map((r) => `'${r}'`).join(', ')}))`;

/**
 * `producer-unavailable` left the stop reasons with the fail-early provider:
 * a loop without a model no longer boots, so no run stops for want of one.
 * No row carries the value (checked on the development database before this
 * migration was written); on any other database the constraint refuses to
 * tighten, which is the right failure.
 */
export class Migration20260929300002_quality_run_stop_reason_check extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "quality_run" drop constraint "quality_run_stop_reason_check";`);
    this.addSql(
      `alter table "quality_run" add constraint "quality_run_stop_reason_check" ${check(KEPT)};`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "quality_run" drop constraint "quality_run_stop_reason_check";`);
    this.addSql(
      `alter table "quality_run" add constraint "quality_run_stop_reason_check" ${check([...KEPT, 'producer-unavailable'])};`,
    );
  }
}
