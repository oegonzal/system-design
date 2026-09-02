import type { Opt } from '@mikro-orm/core';
import { Check, Entity, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

/**
 * A professional experience the prompt generator draws on. Seeded reference
 * data with fixed UUIDs — the application reads, never writes.
 *
 * `import type * as Contracts` rather than a runtime import: the MikroORM CLI
 * loads entities through `@swc-node/register`, which cannot resolve the
 * `@sysdesign/contracts` path alias at runtime. Type-only imports are erased
 * before that matters; the tuple below re-declares the vocabulary locally and
 * `satisfies` makes drift from the contract a compile error.
 */
type ContractArchetypes = (typeof Contracts)['ARCHETYPES'];
const ARCHETYPES = [
  'flash-sale-ticketing',
  'media-streaming-pipeline',
  'workflow-automation',
  'realtime-analytics',
  'dag-orchestration',
  'order-history-integration',
] as const satisfies ContractArchetypes;

@Entity()
@Check({
  name: 'experience_profile_archetype_check',
  expression: `archetype in (${ARCHETYPES.map((a) => `'${a}'`).join(', ')})`,
})
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

  @Property({ type: 'text' })
  archetype!: Contracts.Archetype;

  @Property({ type: 'string[]' })
  techStack!: string[];

  @Property({ type: 'json' })
  scaleFacts!: Contracts.ScaleFacts;

  @Property({ type: 'string[]' })
  highlights!: string[];

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
