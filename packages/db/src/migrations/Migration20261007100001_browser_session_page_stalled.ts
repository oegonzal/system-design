import { Migration } from '@mikro-orm/migrations';

const KEPT = [
  'mission-complete',
  'limit-reached',
  'login-wall',
  'blocked',
  'max-tasks',
  'max-minutes',
  'max-failures',
  'brain-unavailable',
  'page-unreadable',
  'operator-stop',
  'error',
];
/** In the entity's declared order, so the schema check reads no difference. */
const WITH_STALLED = [...KEPT.slice(0, 9), 'page-stalled', ...KEPT.slice(9)];
const check = (reasons: readonly string[]) =>
  `check (termination_reason is null or termination_reason in (${reasons.map((r) => `'${r}'`).join(', ')}))`;

/**
 * `page-stalled` joins the terminations: a session whose page has not changed
 * across the declared number of failed steps now stops saying exactly that,
 * rather than spending a failure budget an operator may have set high for a
 * flaky page on re-asking one unchanged page. Measured 2026-10-07: twenty steps
 * on one unchanged empty document, reported as `max-failures`. The way back
 * refuses to tighten on a database where a session already stopped so, which
 * is the right failure.
 */
export class Migration20261007100001_browser_session_page_stalled extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "browser_session" drop constraint "browser_session_termination_reason_check";`,
    );
    this.addSql(
      `alter table "browser_session" add constraint "browser_session_termination_reason_check" ${check(WITH_STALLED)};`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "browser_session" drop constraint "browser_session_termination_reason_check";`,
    );
    this.addSql(
      `alter table "browser_session" add constraint "browser_session_termination_reason_check" ${check(KEPT)};`,
    );
  }
}
