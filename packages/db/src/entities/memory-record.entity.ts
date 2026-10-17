import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { MemorySpace } from './memory-space.entity';

type ContractKinds = (typeof Contracts)['REGISTER_KINDS'];
type ContractStatuses = (typeof Contracts)['RECORD_STATUSES'];
const KINDS = [
  'working',
  'episodic',
  'semantic',
  'procedural',
  'relational',
] as const satisfies ContractKinds;
const STATUSES = [
  'active',
  'superseded',
  'invalidated',
  'expired',
] as const satisfies ContractStatuses;
const quoted = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

/**
 * One memory in a space, as the agentic-memory runtime keeps it: Postgres is
 * the truth, and the vector index a rebuildable projection of the current rows.
 * A record is never deleted — a write that changes a fact closes the old row
 * (superseded, with its valid time ended) and inserts the next version under
 * the same lineage; an invalidation or an expiry closes it with its reason.
 * Only an active row is current, which the lifecycle check holds structurally,
 * and the partial unique indexes allow one current row per identity and exact
 * scope — or, for a kind that appends, per content and exact scope — so two
 * concurrent writes of one fact, or of one episode, cannot both win.
 */
@Entity()
@Check({ name: 'memory_record_kind_check', expression: `kind in (${quoted(KINDS)})` })
@Check({ name: 'memory_record_status_check', expression: `status in (${quoted(STATUSES)})` })
@Check({
  name: 'memory_record_lifecycle_check',
  expression: `(status = 'active') = (closed_at is null) and (status = 'active') = (valid_to is null)`,
})
@Check({ name: 'memory_record_counts_check', expression: 'version >= 1 and support >= 1' })
@Index({
  name: 'memory_record_visible_index',
  properties: ['space', 'partition', 'register', 'status'],
})
@Index({ name: 'memory_record_valid_from_index', properties: ['space', 'register', 'validFrom'] })
@Index({
  name: 'memory_record_content_hash_index',
  properties: ['space', 'register', 'contentHash'],
})
@Index({ name: 'memory_record_lineage_id_index', properties: ['lineageId'] })
@Index({
  name: 'memory_record_keys_gin_index',
  expression: 'create index "memory_record_keys_gin_index" on "memory_record" using gin ("keys")',
})
@Index({
  name: 'memory_record_scope_gin_index',
  expression:
    'create index "memory_record_scope_gin_index" on "memory_record" using gin ("scope" jsonb_path_ops)',
})
@Index({
  name: 'memory_record_metadata_gin_index',
  expression:
    'create index "memory_record_metadata_gin_index" on "memory_record" using gin ("metadata" jsonb_path_ops)',
})
@Index({
  name: 'memory_record_expiry_index',
  expression: `create index "memory_record_expiry_index" on "memory_record" ("expires_at") where "status" = 'active' and "expires_at" is not null`,
})
@Index({
  name: 'memory_record_current_content_unique',
  expression: `create unique index "memory_record_current_content_unique" on "memory_record" ("space_id", "register", "scope", "content_hash") where "status" = 'active' and "identity" is null`,
})
@Index({
  name: 'memory_record_current_identity_unique',
  expression: `create unique index "memory_record_current_identity_unique" on "memory_record" ("space_id", "register", "scope", "identity") where "status" = 'active' and "identity" is not null`,
})
export class MemoryRecord {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @ManyToOne(() => MemorySpace, { mapToPk: true, deleteRule: 'cascade' })
  space!: string;

  /** The register's name, as the space's strategy declares it. */
  @Property({ type: 'text' })
  register!: string;

  @Property({ type: 'varchar', length: 20 })
  kind!: Contracts.RegisterKind;

  /** The value of the policy's first scope key; every query reads within one. */
  @Property({ type: 'text' })
  partition!: string;

  @Property({ type: 'json' })
  scope!: Contracts.RecordScope;

  /** The identity a write reconciles on; null for a kind that appends. */
  @Property({ type: 'text', nullable: true })
  identity: string | null = null;

  /** The values an exact recall finds the record by. */
  @Property({ type: 'string[]' })
  keys!: string[];

  @Property({ type: 'json' })
  body!: Record<string, unknown>;

  @Property({ type: 'json' })
  metadata!: Record<string, string>;

  /** What is embedded and shown: the kind's template over the body, never scope, ids or times. */
  @Property({ type: 'text' })
  text!: string;

  /** sha256 hex over the register, scope, body and provenance. */
  @Property({ type: 'varchar', length: 64 })
  contentHash!: string;

  @Property({ type: 'varchar', length: 20 })
  status!: Contracts.RecordStatus;

  @Property({ type: 'integer' })
  version!: number;

  @Property({ type: 'uuid', nullable: true })
  supersedesId: string | null = null;

  /** Shared by every version of one identity: the first version's id. */
  @Property({ type: 'uuid' })
  lineageId!: string;

  @Property({ type: 'timestamptz' })
  validFrom!: Date;

  @Property({ type: 'timestamptz', nullable: true })
  validTo: Date | null = null;

  @Property({ type: 'timestamptz' })
  recordedAt!: Date;

  @Property({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  closedAt: Date | null = null;

  @Property({ type: 'text', nullable: true })
  closeReason: string | null = null;

  @Property({ type: 'integer' })
  support!: number;

  @Property({ type: 'json' })
  provenance!: { source: string; sourceRunId: string | null; derivedFrom: string[] };

  /** The vector collection this row's point lives in; null when it has none. */
  @Property({ type: 'text', nullable: true })
  projectedInto: string | null = null;
}
