import type { Opt } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { QualityRun } from './quality-run.entity';

type ContractSupportKinds = (typeof Contracts)['SUPPORT_KINDS'];
const SUPPORT_KINDS = ['confirms', 'contradicts'] as const satisfies ContractSupportKinds;

/**
 * What one run's evidence said about a knowledge item another run stored: that
 * it holds again, or that it does not hold here. One row per stored point per
 * confirming run, which is what makes reinforcement idempotent — a run
 * digested twice replaces its own rows and counts once, where a counter on the
 * point itself could only be incremented and would race.
 *
 * The count a search sees is denormalised onto the vector store's payload and
 * recomputed from these rows after every write, so the rows are the truth and
 * the payload is a cache of them. `contentHash` is the target's text as it
 * stood when the claim was made: a point whose statement is later re-digested
 * into different words keeps its id and loses this support exactly, with no
 * rule reading either text.
 *
 * Both run references are held as ids (`mapToPk`) because the adapter writes
 * them in bulk and never loads the runs. A claim dies with the run that made
 * it; a digest run removed later leaves the claim standing, since the claim
 * was the source run's, not the digest's.
 */
@Entity()
@Unique({ properties: ['pointId', 'sourceRun'] })
@Index({ properties: ['targetRunId'] })
@Check({
  name: 'memory_support_kind_check',
  expression: `kind in (${SUPPORT_KINDS.map((kind) => `'${kind}'`).join(', ')})`,
})
export class MemorySupport {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  /** The stored point the claim is about — `pointId(targetRunId, targetRef)` in the store's adapter. */
  @Property({ type: 'uuid' })
  pointId!: string;

  /** The run the point was digested from, and the item within it; provenance a reader can follow. */
  @Property({ type: 'varchar', length: 80 })
  targetRunId!: string;

  @Property({ type: 'varchar', length: 200 })
  targetRef!: string;

  /** The point's text as the claim was made against it: sha256 hex. */
  @Property({ type: 'varchar', length: 64 })
  contentHash!: string;

  /** The run whose evidence made the claim. Its rows are replaced whole when it is digested again. */
  @Index()
  @ManyToOne(() => QualityRun, { mapToPk: true, deleteRule: 'cascade' })
  sourceRun!: string;

  /** The digest run that wrote the claim; null once that run is swept. */
  @ManyToOne(() => QualityRun, { nullable: true, mapToPk: true, deleteRule: 'set null' })
  digestRun: string | null = null;

  @Property({ type: 'text' })
  kind!: Contracts.SupportKind;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
