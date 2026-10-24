import { Migration } from '@mikro-orm/migrations';

const EARLIER_KINDS = [
  'award-ending',
  'award-end-moved',
  'award-notice',
  'pulse-above-band',
  'lead-new',
];
const QUIET_KINDS = ['target-quiet'];
const quoted = (words: readonly string[]): string => words.map((word) => `'${word}'`).join(', ');

/**
 * A sixth kind of alert: a tracked firm or award left quiet after an
 * outreach for the profile's business days, raised once per outreach by the
 * daily warm. The alert check admits it; the kinds are written in the order
 * the vocabulary declares them, since the check is compared as text.
 */
export class Migration20261023100004_govcon_target_quiet_alert extends Migration {
  override name = 'Migration20261023100004_govcon_target_quiet_alert';

  override up(): void | Promise<void> {
    this.kindCheck([...EARLIER_KINDS, ...QUIET_KINDS]);
  }

  override down(): void | Promise<void> {
    // An alert of a kind the earlier check refuses cannot be kept by it.
    this.addSql(`delete from "govcon_alert" where kind in (${quoted(QUIET_KINDS)});`);
    this.kindCheck(EARLIER_KINDS);
  }

  private kindCheck(kinds: readonly string[]): void {
    this.addSql(`alter table "govcon_alert" drop constraint if exists "govcon_alert_kind_check";`);
    this.addSql(
      `alter table "govcon_alert" add constraint "govcon_alert_kind_check" check (kind in (${quoted(kinds)}));`,
    );
  }
}
