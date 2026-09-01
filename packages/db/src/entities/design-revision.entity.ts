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
   * The walkthrough — the author's prose explanation, for a human reader and
   * the LLM critic. Advisory: the deterministic score never reads it, because
   * nothing deterministic can judge writing without guessing at substrings.
   */
  @Property({ type: 'text', nullable: true })
  narrative: string | null = null;

  /**
   * The graded half of the explanation: requirement bindings and traced flows,
   * every field a reference into the graph or the prompt rather than text.
   * Null on revisions submitted before briefs existed.
   */
  @Property({ type: 'json', nullable: true })
  brief: Contracts.DesignBrief | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
