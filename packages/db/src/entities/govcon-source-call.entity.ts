import { Check, Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractOutcomes = (typeof Contracts)['SOURCE_CALL_OUTCOMES'];
const OUTCOMES = [
  'ok',
  'error',
  'rate-limited',
  'invalid-response',
] as const satisfies ContractOutcomes;

/**
 * One request the govcon package made to an upstream source. The row is both
 * the short-lived cache (a fresh `ok` row for the same query key means the
 * records are already stored — nothing to fetch) and the budget ledger (every
 * attempt counts, errors and rate limits included). `query` is the canonical
 * query the key was hashed from; the API key is not a query field, so it
 * cannot appear here.
 */
@Entity()
@Index({ properties: ['source', 'queryKey', 'requestedAt'] })
@Index({ properties: ['source', 'requestedAt'] })
@Check({
  name: 'govcon_source_call_outcome_check',
  expression: `outcome in (${OUTCOMES.map((o) => `'${o}'`).join(', ')})`,
})
export class GovconSourceCall {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @Property({ type: 'varchar', length: 40 })
  source!: string;

  /** sha256 hex of the canonical query. */
  @Property({ type: 'varchar', length: 64 })
  queryKey!: string;

  @Property({ type: 'json' })
  query!: unknown;

  @Property({ type: 'timestamptz' })
  requestedAt!: Date;

  @Property({ type: 'integer' })
  durationMs!: number;

  @Property({ type: 'integer', nullable: true })
  status!: number | null;

  @Property({ type: 'text' })
  outcome!: Contracts.SourceCallOutcome;

  @Property({ type: 'integer', nullable: true })
  totalRecords!: number | null;

  @Property({ type: 'integer', nullable: true })
  recordCount!: number | null;

  @Property({ type: 'text', nullable: true })
  error!: string | null;
}
