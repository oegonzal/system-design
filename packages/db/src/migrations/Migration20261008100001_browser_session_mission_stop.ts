import { Migration } from '@mikro-orm/migrations';

/** The causes the engine used to own, which every recorded mission stop was one of. */
const OLD_CAUSES = ['mission-complete', 'limit-reached', 'login-wall', 'blocked'];
const ENGINE = [
  'max-tasks',
  'max-minutes',
  'max-failures',
  'brain-unavailable',
  'page-unreadable',
  'page-stalled',
  'operator-stop',
  'error',
];
const quoted = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(', ');
const reasonCheck = (reasons: readonly string[]) =>
  `check (termination_reason is null or termination_reason in (${quoted(reasons)}))`;

/**
 * A stop is the mission's: which one ended a session moves to its own column,
 * `termination_cause`, and the reason says only that a mission stop did —
 * `mission-stop`. The four causes the engine used to own become ordinary
 * mission data, and a mission may declare any other. The way back refuses to
 * run on a database holding a cause outside those four, as `page_stalled`'s
 * does on a reason its own list lacks.
 */
export class Migration20261008100001_browser_session_mission_stop extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "browser_session" add column "termination_cause" text null;`);
    this.addSql(
      `alter table "browser_session" drop constraint "browser_session_termination_reason_check";`,
    );
    this.addSql(
      `update "browser_session" set "termination_cause" = "termination_reason", "termination_reason" = 'mission-stop' where "termination_reason" in (${quoted(OLD_CAUSES)});`,
    );
    this.addSql(
      `alter table "browser_session" add constraint "browser_session_termination_reason_check" ${reasonCheck(['mission-stop', ...ENGINE])};`,
    );
    this.addSql(
      `alter table "browser_session" add constraint "browser_session_termination_cause_check" check ((termination_reason = 'mission-stop') = (termination_cause is not null));`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "browser_session" drop constraint "browser_session_termination_cause_check";`,
    );
    this.addSql(
      `alter table "browser_session" drop constraint "browser_session_termination_reason_check";`,
    );
    this.addSql(
      `update "browser_session" set "termination_reason" = "termination_cause" where "termination_reason" = 'mission-stop';`,
    );
    this.addSql(
      `alter table "browser_session" add constraint "browser_session_termination_reason_check" ${reasonCheck([...OLD_CAUSES, ...ENGINE])};`,
    );
    this.addSql(`alter table "browser_session" drop column "termination_cause";`);
  }
}
