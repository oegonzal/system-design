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
  'operator-stop',
  'error',
];
const check = (reasons: readonly string[]) =>
  `check (termination_reason is null or termination_reason in (${reasons.map((r) => `'${r}'`).join(', ')}))`;

/**
 * `page-unreadable` joins the terminations: a session whose adapter cannot
 * read the page, observation after observation, now stops saying exactly that
 * rather than spending its failure budget on plans written against nothing
 * and reporting `max-failures`. The way back refuses to tighten on a database
 * where a session already stopped so, which is the right failure.
 */
export class Migration20261003100005_browser_session_page_unreadable extends Migration {
  override up(): void | Promise<void> {
    this.addSql(
      `alter table "browser_session" drop constraint "browser_session_termination_reason_check";`,
    );
    this.addSql(
      `alter table "browser_session" add constraint "browser_session_termination_reason_check" ${check([...KEPT, 'page-unreadable'])};`,
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
