import type { Opt, Rel } from '@mikro-orm/core';
import { Collection } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { DesignRevision } from './design-revision.entity';
import { Prompt } from './prompt.entity';

type ContractStatuses = (typeof Contracts)['SESSION_STATUSES'];
const STATUSES = ['in-progress', 'completed', 'abandoned'] as const satisfies ContractStatuses;

/** One attempt at one prompt; revisions accumulate under it. */
@Entity()
@Check({
  name: 'design_session_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
export class DesignSession {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  /** restrict: a prompt with sessions is history worth keeping — archive it instead. */
  @Index()
  @ManyToOne(() => Prompt, { deleteRule: 'restrict' })
  prompt!: Rel<Prompt>;

  @Property({ type: 'text' })
  status: Opt<Contracts.SessionStatus> = 'in-progress';

  @OneToMany(() => DesignRevision, (revision) => revision.session)
  revisions = new Collection<DesignRevision>(this);

  /**
   * The unsubmitted canvas, saved as the author works and shape-checked
   * only; restored on the next open ahead of the last submitted revision,
   * cleared by a submit or a coach run started from it.
   */
  @Property({ type: 'json', nullable: true })
  draft: Contracts.SessionDraft | null = null;

  /**
   * Interview mode's clock: the format's current phase, when it began, and
   * every phase entered so far with its start and end. Null and empty for a
   * session whose format declares no phases. Recorded, never enforced.
   */
  @Property({ type: 'text', nullable: true })
  phase: string | null = null;

  @Property({ type: 'timestamptz', nullable: true })
  phaseStartedAt: Date | null = null;

  @Property({ type: 'json' })
  phaseLog: Opt<Contracts.TranscriptPhase[]> = [];

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Opt<Date> = new Date();
}
