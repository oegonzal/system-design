import type { Opt, Rel } from '@mikro-orm/core';
import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { DesignSession } from './design-session.entity';

/**
 * An immutable snapshot of the canvas at submit time. No `updatedAt` on
 * purpose: a revision is history, and history does not change — iteration
 * happens by submitting the next revision.
 *
 * `Rel<DesignSession>` breaks the circular-import TDZ crash under
 * `emitDecoratorMetadata` (session ↔ revision import each other): the
 * metadata serialises to `Object` while the relation still resolves through
 * the lazy `() => DesignSession`.
 */
@Entity()
@Unique({ properties: ['session', 'revisionNumber'] })
export class DesignRevision {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  /** cascade: a deleted session's snapshots are meaningless on their own. */
  @Index()
  @ManyToOne(() => DesignSession, { deleteRule: 'cascade' })
  session!: Rel<DesignSession>;

  /** 1-indexed, dense per session — assigned as max + 1 inside the submit transaction. */
  @Property({ type: 'integer' })
  revisionNumber!: number;

  @Property({ type: 'json' })
  graph!: Contracts.CanvasGraph;

  /**
   * The design narrative — the author's prose explanation of what each
   * component is for and how they cooperate to meet the requirements.
   */
  @Property({ type: 'text', nullable: true })
  narrative: string | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
