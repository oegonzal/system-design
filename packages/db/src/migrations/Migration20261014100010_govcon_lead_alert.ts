import { Migration } from '@mikro-orm/migrations';

const EARLIER_KINDS = ['award-ending', 'award-end-moved', 'award-notice', 'pulse-above-band'];
const LEAD_KINDS = ['lead-new'];
const quoted = (words: readonly string[]): string => words.map((word) => `'${word}'`).join(', ');

/**
 * A fifth kind of alert: a stored notice the profile ranks high enough to
 * hear about, raised once per notice after the daily pull. The alert check
 * admits it; the kinds are written in the order the vocabulary declares
 * them, since the check is compared as text.
 */
export class Migration20261014100010_govcon_lead_alert extends Migration {
  override up(): void | Promise<void> {
    this.kindCheck([...EARLIER_KINDS, ...LEAD_KINDS]);
  }

  override down(): void | Promise<void> {
    // An alert of a kind the earlier check refuses cannot be kept by it.
    this.addSql(`delete from "govcon_alert" where kind in (${quoted(LEAD_KINDS)});`);
    this.kindCheck(EARLIER_KINDS);
  }

  private kindCheck(kinds: readonly string[]): void {
    this.addSql(`alter table "govcon_alert" drop constraint if exists "govcon_alert_kind_check";`);
    this.addSql(
      `alter table "govcon_alert" add constraint "govcon_alert_kind_check" check (kind in (${quoted(kinds)}));`,
    );
  }
}
