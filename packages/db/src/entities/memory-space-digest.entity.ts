import { Entity, Index, ManyToOne, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { MemorySpace } from './memory-space.entity';

/**
 * One digest remembered into a memory space, recorded once, after its writes:
 * the ledger a second apply of the same digest is refused by. Keyed by the
 * register-memory orchestration the digest was read from — like
 * `digestRunId`, the run its memories came from, a plain column and never a
 * foreign key, since the loop is another service. `items` holds what each
 * endorsed memory's write did, in the order they were written: the record it
 * left current, or the runtime's refusal of it.
 */
@Entity()
export class MemorySpaceDigest {
  @PrimaryKey({ type: 'uuid' })
  orchestrationRunId!: string;

  /** Indexed for the cascade: deleting a space finds its applies without scanning the table. */
  @Index()
  @ManyToOne(() => MemorySpace, { mapToPk: true, deleteRule: 'cascade' })
  space!: string;

  @Property({ type: 'varchar', length: 80, nullable: true })
  digestRunId: string | null = null;

  @Property({ type: 'json' })
  items!: Contracts.DigestItemDto[];

  @Property({ type: 'timestamptz' })
  appliedAt!: Date;
}
