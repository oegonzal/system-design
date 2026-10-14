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
  'award-count',
];
const PRIMES_OPERATIONS = [
  'subaward-count',
  'subawards',
  'award-detail',
  'award-orders',
  'award-subawards',
];
const EARLIER_LENSES = [
  'pulse',
  'breakdown',
  'horizon',
  'agencies',
  'agency',
  'freshness',
  'reach',
];
const PRIMES_LENSES = ['primes', 'award'];
const quoted = (words: readonly string[]): string => words.map((word) => `'${word}'`).join(', ');

/**
 * Primes and awards: the subcontracts primes report, counted and read a
 * page at a time, and one award's own record with what was ordered under it
 * and its subcontractors — five ledger operations — kept as two lenses in
 * the snapshot table. Both vocabularies back a check, so each check admits
 * the new words.
 */
export class Migration20261014100008_govcon_primes extends Migration {
  override up(): void | Promise<void> {
    this.operationCheck([...EARLIER_OPERATIONS, ...PRIMES_OPERATIONS]);
    this.lensCheck([...EARLIER_LENSES, ...PRIMES_LENSES]);
  }

  override down(): void | Promise<void> {
    this.addSql(
      `delete from "govcon_source_call" where operation in (${quoted(PRIMES_OPERATIONS)});`,
    );
    this.operationCheck(EARLIER_OPERATIONS);
    this.addSql(`delete from "govcon_spending_snapshot" where lens in (${quoted(PRIMES_LENSES)});`);
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
