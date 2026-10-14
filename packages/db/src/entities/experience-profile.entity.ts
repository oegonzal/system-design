import type { Opt } from '@mikro-orm/core';
import { Check, Entity, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

// A local tuple with `satisfies` against the contract tuple — the class doc says why.
type ContractOrigins = (typeof Contracts)['EXPERIENCE_ORIGINS'];
const ORIGINS = ['own', 'practice'] as const satisfies ContractOrigins;

/**
 * A professional experience the prompt pipeline draws on. Seeded reference
 * data with fixed UUIDs — the application reads, never writes. Everything a
 * prompt needs is in the prose: the summary, the stack, the highlights and the
 * practice highlights after them are rendered as the goal the quality loop's
 * prompt pipeline writes from. Each row declares whose it is (`origin`), and
 * an own row keeps apart the lines it carries only for practice, so the
 * record exported as the subject's states neither a practice example nor a
 * practice line as theirs. Neither column has a default: the seed declares
 * both.
 *
 * Sibling entities use `import type * as Contracts` rather than a runtime
 * import: the MikroORM CLI loads entities through `@swc-node/register`, which
 * cannot resolve the `@sysdesign/contracts` path alias at runtime. Type-only
 * imports are erased before that matters; each entity re-declares its
 * vocabulary locally and `satisfies` makes drift from the contract a compile
 * error.
 */
@Entity()
@Check({
  name: 'experience_profile_origin_check',
  expression: `origin in (${ORIGINS.map((origin) => `'${origin}'`).join(', ')})`,
})
export class ExperienceProfile {
  /** Fixed in the fixture, so re-seeding upserts in place. */
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Unique()
  @Property({ type: 'varchar', length: 60 })
  slug!: string;

  @Property({ type: 'text' })
  origin!: Contracts.ExperienceOrigin;

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

  @Property({ type: 'string[]' })
  practiceHighlights!: string[];

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
