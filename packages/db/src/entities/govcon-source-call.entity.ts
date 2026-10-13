import type { Opt } from '@mikro-orm/core';
import { Check, Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

type ContractOutcomes = (typeof Contracts)['SOURCE_CALL_OUTCOMES'];
const OUTCOMES = [
  'ok',
  'error',
  'rate-limited',
  'invalid-response',
] as const satisfies ContractOutcomes;

type ContractOperations = (typeof Contracts)['SOURCE_OPERATIONS'];
const OPERATIONS = [
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
] as const satisfies ContractOperations;

/**
 * One HTTP attempt the govcon package made against an upstream source. The
 * table is both the short-lived cache (a fresh `ok` search row for the same
 * query key means the records are already stored — nothing to fetch) and the
 * budget ledger (every attempt counts, retries, errors and rate limits
 * included; `attempt` numbers the attempts of one logical call). `query` is
 * the canonical query the key was hashed from, typed by `operation`; the API
 * key is not a query field, so it cannot appear here. `seq` orders rows that
 * share a timestamp.
 */
@Entity()
@Index({
  name: 'govcon_source_call_fresh_index',
  expression:
    'create index "govcon_source_call_fresh_index" on "govcon_source_call" ("source", "query_key", "operation", "outcome", "requested_at" desc)',
})
@Index({
  name: 'govcon_source_call_page_index',
  expression:
    'create index "govcon_source_call_page_index" on "govcon_source_call" ("requested_at" desc, "seq" desc)',
})
@Index({ properties: ['source', 'requestedAt'] })
@Check({
  name: 'govcon_source_call_outcome_check',
  expression: `outcome in (${OUTCOMES.map((o) => `'${o}'`).join(', ')})`,
})
@Check({
  name: 'govcon_source_call_operation_check',
  expression: `operation in (${OPERATIONS.map((o) => `'${o}'`).join(', ')})`,
})
export class GovconSourceCall {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  /** Insertion order, for a stable page when timestamps tie. Assigned by the database. */
  @Property({ type: 'bigint', autoincrement: true, unique: true })
  seq!: string & Opt;

  @Property({ type: 'varchar', length: 40 })
  source!: string;

  /** Every operation spends the budget; only searches feed the cache. */
  @Property({ type: 'varchar', length: 20 })
  operation!: Contracts.SourceOperation;

  /** 1 for the first HTTP attempt of a call, 2 for its retry. */
  @Property({ type: 'smallint' })
  attempt!: number;

  /** sha256 hex of the canonical query. */
  @Property({ type: 'varchar', length: 64 })
  queryKey!: string;

  @Property({ type: 'json' })
  query!: Contracts.SourceCallQuery;

  @Property({ type: 'timestamptz' })
  requestedAt!: Date;

  @Property({ type: 'integer' })
  durationMs!: number;

  @Property({ type: 'integer', nullable: true })
  status!: number | null;

  @Property({ type: 'varchar', length: 20 })
  outcome!: Contracts.SourceCallOutcome;

  @Property({ type: 'integer', nullable: true })
  totalRecords!: number | null;

  @Property({ type: 'integer', nullable: true })
  recordCount!: number | null;

  @Property({ type: 'text', nullable: true })
  error!: string | null;
}
