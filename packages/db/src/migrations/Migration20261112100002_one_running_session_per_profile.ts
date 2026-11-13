import { Migration } from '@mikro-orm/migrations';

/**
 * One running browser session per profile, held by the database. The engine
 * checks the lease before it touches a profile's files, but the row that
 * makes a lease visible to another process is written minutes later — after
 * the files are restored and the loop waited for — and two tasks started in
 * that window (the schedule and a hand-run, a retried invocation) would each
 * pass the check, open a browser on the same profile and archive over each
 * other. A partial unique index refuses the second row where the check could
 * not; the ledger turns the refusal into the session's own.
 *
 * Before the index is made, a profile with more than one `running` row keeps
 * the one that beat last and closes the rest exactly as the start-of-session
 * sweep closes a session that stopped beating (status, reason, detail and
 * finished_at as `MikroOrmLedger.failStale` writes them). The owner's
 * database held one running row per profile on 2026-11-12, so the step is
 * defensive. `down` drops the index and leaves the rows as they are.
 */
export class Migration20261112100002_one_running_session_per_profile extends Migration {
  override name = 'Migration20261112100002_one_running_session_per_profile';

  override up(): void | Promise<void> {
    this.addSql(`
      update "browser_session"
      set status = 'failed',
          termination_reason = 'interrupted',
          termination_cause = null,
          termination_detail = 'stopped beating at '
            || to_char(heartbeat_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
            || ' without closing',
          finished_at = heartbeat_at
      where status = 'running'
        and id not in (
          select distinct on (profile) id
          from "browser_session"
          where status = 'running'
          order by profile, heartbeat_at desc, started_at desc, id
        );
    `);
    this.addSql(`
      create unique index if not exists "browser_session_running_profile"
        on "browser_session" ("profile") where status = 'running';
    `);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists "browser_session_running_profile";`);
  }
}
