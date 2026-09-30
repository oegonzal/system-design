import type { Opt } from '@mikro-orm/core';
import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';

/**
 * A professional experience the prompt pipeline draws on. Seeded reference
 * data with fixed UUIDs — the application reads, never writes. Everything a
 * prompt needs is in the prose: the summary, the stack and the highlights
 * (which carry the numbers) are rendered as the goal the quality loop's
 * prompt pipeline writes from.
 *
 * Sibling entities use `import type * as Contracts` rather than a runtime
 * import: the MikroORM CLI loads entities through `@swc-node/register`, which
 * cannot resolve the `@sysdesign/contracts` path alias at runtime. Type-only
 * imports are erased before that matters; each entity re-declares its
 * vocabulary locally and `satisfies` makes drift from the contract a compile
 * error.
 */
@Entity()
export class ExperienceProfile {
  /** Fixed in the fixture, so re-seeding upserts in place. */
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Unique()
  @Property({ type: 'varchar', length: 60 })
  slug!: string;

  @Property({ type: 'varchar', length: 80 })
  companyLabel!: string;

  @Property({ type: 'varchar', length: 120 })
  title!: string;

  @Property({ type: 'text' })
  summary!: string;

  @Property({ type: 'string[]' })
  techStack!: string[];

  @Property({ type: 'string[]' })
  highlights!: string[];

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
