import { Migration } from '@mikro-orm/migrations';

const EARLIER = ['stated', 'restated', 'derived', 'mapped', 'inferred', 'composed', 'policy', 'none'];
const UNIT = 'unit';
/** The words in the entity's declared order — the check is compared as text, so the order is part of the schema. */
const WITH_UNIT = [...EARLIER.slice(0, -1), UNIT, ...EARLIER.slice(-1)];
const quoted = (words: readonly string[]): string => words.map((word) => `'${word}'`).join(', ');

/**
 * A field answer may rest on what the page stated about the open unit of work
 * — the goal's Open unit of work carries the page's own words — and declares
 * so by the kind `unit`, one word of the contracts' `ANSWER_BASES`. The check
 * admits the word. The `down` has no word for it: a row that rested so is
 * left resting on nothing it can name, as every decision that is not a field
 * answer does.
 */
export class Migration20261014200003_browser_decision_rests_unit extends Migration {
  override up(): void | Promise<void> {
    this.restsCheck(WITH_UNIT);
  }

  override down(): void | Promise<void> {
    this.addSql(`update "browser_decision" set "rests" = null where "rests" = '${UNIT}';`);
    this.restsCheck(EARLIER);
  }

  private restsCheck(words: readonly string[]): void {
    this.addSql(`alter table "browser_decision" drop constraint "browser_decision_rests_check";`);
    this.addSql(
      `alter table "browser_decision" add constraint "browser_decision_rests_check" check (rests is null or rests in (${quoted(words)}));`,
    );
  }
}
