import { Migration } from '@mikro-orm/migrations';

/** In the entity's declared order, so the schema check reads no difference. */
const BEFORE = [
  'mission-stop',
  'max-tasks',
  'max-minutes',
  'max-failures',
  'brain-unavailable',
  'page-unreadable',
  'page-stalled',
  'operator-stop',
  'error',
];
const WITH_TARGET = [BEFORE[0], 'target-reached', ...BEFORE.slice(1)];
const check = (reasons: readonly string[]) =>
  `check (termination_reason is null or termination_reason in (${reasons.map((r) => `'${r}'`).join(', ')}))`;

/**
 * `target-reached` joins the terminations: a session asked to close a number
 * of units of work `done` (`--target-done`) ends complete once it has, and
 * says so, rather than running on to a limit that would end it stopped. The
 * way back refuses to tighten on a database where a session already ended
 * so, which is the right failure.
 */
export class Migration20261009100001_browser_session_target_reached extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "browser_session" drop constraint "browser_session_termination_reason_check";`,
    );
    this.addSql(
      `alter table "browser_session" add constraint "browser_session_termination_reason_check" ${check(WITH_TARGET)};`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "browser_session" drop constraint "browser_session_termination_reason_check";`,
    );
    this.addSql(
      `alter table "browser_session" add constraint "browser_session_termination_reason_check" ${check(BEFORE)};`,
    );
  }
}
