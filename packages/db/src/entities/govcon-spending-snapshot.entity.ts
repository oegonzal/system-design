import { PrimaryKeyProp } from '@mikro-orm/core';
import { Check, Entity, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractLenses = (typeof Contracts)['SPENDING_LENSES'];
const LENSES = [
  'pulse',
  'breakdown',
  'horizon',
  'agencies',
  'agency',
  'freshness',
  'reach',
  'primes',
  'award',
] as const satisfies ContractLenses;

/**
 * One spending lens's answer for one canonical query, as the service last
 * computed it from USAspending: the snapshot a lens reads inside the cache
 * window instead of spending again, and serves as `stale` when a refresh
 * fails. `payload` is the lens body, validated against the lens's own schema
 * on every read; `query` is the canonical query the key was hashed from, for
 * a human reading the row; `requests` is what the snapshot cost the ledger.
 */
@Entity()
@Check({
  name: 'govcon_spending_snapshot_lens_check',
  expression: `lens in (${LENSES.map((lens) => `'${lens}'`).join(', ')})`,
})
export class GovconSpendingSnapshot {
  [PrimaryKeyProp]?: ['lens', 'queryKey'];

  @PrimaryKey({ type: 'varchar', length: 20 })
  lens!: Contracts.SpendingLens;

  /** sha256 hex of the lens and the canonical query. */
  @PrimaryKey({ type: 'varchar', length: 64 })
  queryKey!: string;

  @Property({ type: 'json' })
  query!: object;

  @Property({ type: 'timestamptz' })
  fetchedAt!: Date;

  /** The source's own "data as of" date, when it said. */
  @Property({ type: 'date', nullable: true })
  asOf!: string | null;

  @Property({ type: 'integer' })
  requests!: number;

  @Property({ type: 'json' })
  payload!: unknown;
}
