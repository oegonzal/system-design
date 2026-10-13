import { Migration } from '@mikro-orm/migrations';

const EARLIER_OPERATIONS = [
  'search',
  'description',
  'attachment',
  'awards',
  'spending',
  'entity',
  'exclusions',
  'series',
  'breakdown',
  'horizon',
  'agency-budget',
  'agency-offices',
  'agency-directory',
  'freshness',
];
const REACH_OPERATIONS = ['award-count'];
const EARLIER_LENSES = ['pulse', 'breakdown', 'horizon', 'agencies', 'agency', 'freshness'];
const REACH_LENSES = ['reach'];
const quoted = (words: readonly string[]): string => words.map((word) => `'${word}'`).join(', ');

/**
 * The reach count: how many awards a scope holds, read through
 * USAspending's count endpoint as its own ledger operation and kept as its
 * own lens in the snapshot table. Both vocabularies back a check, so each
 * check admits the new word.
 */
export class Migration20261014100006_govcon_reach extends Migration {
  override up(): void | Promise<void> {
    this.operationCheck([...EARLIER_OPERATIONS, ...REACH_OPERATIONS]);
    this.lensCheck([...EARLIER_LENSES, ...REACH_LENSES]);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `delete from "govcon_source_call" where operation in (${quoted(REACH_OPERATIONS)});`,
    );
    this.operationCheck(EARLIER_OPERATIONS);
    this.addSql(`delete from "govcon_spending_snapshot" where lens in (${quoted(REACH_LENSES)});`);
    this.lensCheck(EARLIER_LENSES);
  }

  private operationCheck(operations: readonly string[]): void {
    this.addSql(
      `alter table "govcon_source_call" drop constraint if exists "govcon_source_call_operation_check";`,
    );
    this.addSql(
      `alter table "govcon_source_call" add constraint "govcon_source_call_operation_check" check (operation in (${quoted(operations)}));`,
    );
  }

  private lensCheck(lenses: readonly string[]): void {
    this.addSql(
      `alter table "govcon_spending_snapshot" drop constraint if exists "govcon_spending_snapshot_lens_check";`,
    );
    this.addSql(
      `alter table "govcon_spending_snapshot" add constraint "govcon_spending_snapshot_lens_check" check (lens in (${quoted(lenses)}));`,
    );
  }
}
