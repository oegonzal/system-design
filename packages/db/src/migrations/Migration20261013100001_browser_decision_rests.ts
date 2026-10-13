import { Migration } from '@mikro-orm/migrations';

/**
 * A field answer declares how its value rests on the evidence — one word of
 * the contracts' `ANSWER_BASES` — in place of the producer's three-word
 * confidence, which the read-back could not route by: it could not tell a
 * fact transferred from another wording from a fact invented. The old column
 * goes with its check; rows from before carry null in the new one, as every
 * decision that is not a field answer does. The `down` restores the column
 * and its check, the values lost.
 */
export class Migration20261013100001_browser_decision_rests extends Migration {
  override up(): void | Promise<void> {
    this.addSql(`alter table "browser_decision" drop constraint "browser_decision_confidence_check";`);
    this.addSql(`alter table "browser_decision" drop column "confidence";`);
    this.addSql(`alter table "browser_decision" add column "rests" text null;`);
    this.addSql(
      `alter table "browser_decision" add constraint "browser_decision_rests_check" check (rests is null or rests in ('stated', 'restated', 'derived', 'mapped', 'inferred', 'composed', 'policy', 'none'));`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "browser_decision" drop constraint "browser_decision_rests_check";`);
    this.addSql(`alter table "browser_decision" drop column "rests";`);
    this.addSql(`alter table "browser_decision" add column "confidence" text null;`);
    this.addSql(
      `alter table "browser_decision" add constraint "browser_decision_confidence_check" check (confidence is null or confidence in ('high', 'medium', 'low'));`,
    );
  }
}
