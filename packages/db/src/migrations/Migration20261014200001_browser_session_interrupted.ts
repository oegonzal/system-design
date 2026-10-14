import { Migration } from '@mikro-orm/migrations';

const EARLIER = [
  'mission-stop',
  'target-reached',
  'max-tasks',
  'max-minutes',
  'max-failures',
  'brain-unavailable',
  'page-unreadable',
  'page-stalled',
  'operator-stop',
  'error',
];
const INTERRUPTED = 'interrupted';
/** The silence a reader takes for death, as the engine declared it when this was written (`SESSION_STALE_AFTER_MS`). */
const STALE_AFTER_SECONDS = 60;
const quoted = (words: readonly string[]): string => words.map((word) => `'${word}'`).join(', ');

/**
 * A session whose process stopped beating without closing it — killed,
 * crashed, the machine put to sleep — stayed `running` for good: nothing ever
 * closed it. From now the next session to start closes such a row as failed
 * and `interrupted`, finished at its last beat. The check admits the word,
 * and the rows already stranded are closed the same way here, once, so the
 * table says the same thing about them that the engine will about the next.
 */
export class Migration20261014200001_browser_session_interrupted extends Migration {
  override up(): void | Promise<void> {
    this.terminationCheck([...EARLIER, INTERRUPTED]);
    this.addSql(`
      update "browser_session"
         set "status" = 'failed',
             "termination_reason" = '${INTERRUPTED}',
             "termination_detail" = 'stopped beating at ' || to_char("heartbeat_at" at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') || ' without closing',
             "finished_at" = "heartbeat_at"
       where "status" = 'running'
         and "heartbeat_at" < now() - interval '${STALE_AFTER_SECONDS} seconds';
    `);
  }

  override down(): void | Promise<void> {
    // The earlier check has no word for it: what ended it is not known, which it calls an error.
    this.addSql(
      `update "browser_session" set "termination_reason" = 'error' where "termination_reason" = '${INTERRUPTED}';`,
    );
    this.terminationCheck(EARLIER);
  }

  private terminationCheck(words: readonly string[]): void {
    this.addSql(
      `alter table "browser_session" drop constraint if exists "browser_session_termination_reason_check";`,
    );
    this.addSql(
      `alter table "browser_session" add constraint "browser_session_termination_reason_check" check (termination_reason is null or termination_reason in (${quoted(words)}));`,
    );
  }
}
