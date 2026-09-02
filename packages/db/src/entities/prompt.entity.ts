import type { Opt, Rel } from '@mikro-orm/core';
import {
  Check,
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
} from '@mikro-orm/decorators/legacy';
import type * as Contracts from '@sysdesign/contracts';

import { ExperienceProfile } from './experience-profile.entity';

// Local tuples with `satisfies` against the contract tuples — see
// experience-profile.entity.ts for why entities cannot runtime-import
// @sysdesign/contracts.
type ContractDifficulties = (typeof Contracts)['PROMPT_DIFFICULTIES'];
const DIFFICULTIES = ['intro', 'standard', 'advanced'] as const satisfies ContractDifficulties;

type ContractStatuses = (typeof Contracts)['PROMPT_STATUSES'];
const STATUSES = ['active', 'archived'] as const satisfies ContractStatuses;

/**
 * A generated design prompt. `seed` + `generatorVersion` make it reproducible:
 * the generator is pure, so the row is an audit record of its inputs as much
 * as a cache of its output.
 */
@Entity()
@Check({
  name: 'prompt_difficulty_check',
  expression: `difficulty in (${DIFFICULTIES.map((d) => `'${d}'`).join(', ')})`,
})
@Check({
  name: 'prompt_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
export class Prompt {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  /** restrict: experiences are seeded reference data; never orphan a prompt. */
  @Index()
  @ManyToOne(() => ExperienceProfile, { deleteRule: 'restrict' })
  experience!: Rel<ExperienceProfile>;

  /** Denormalized from the experience so list filtering needs no join. */
  @Property({ type: 'text' })
  archetype!: Contracts.Archetype;

  @Property({ type: 'varchar', length: 120 })
  title!: string;

  @Property({ type: 'text' })
  scenario!: string;

  @Property({ type: 'string[]' })
  functionalRequirements!: string[];

  /** The machine-readable half of the requirements — what the engine gates on. */
  @Property({ type: 'json' })
  functionalCapabilities: Contracts.FunctionalCapability[] = [];

  @Property({ type: 'json' })
  nonFunctionalRequirements!: Contracts.NfrItem[];

  @Property({ type: 'json' })
  scaleTargets!: Contracts.ScaleTargets;

  /**
   * The business layer, when the archetype declares one. Nullable and never
   * backfilled: absence is exactly what keeps the product dimension out of
   * pre-existing prompts' rubrics.
   */
  @Property({ type: 'json', nullable: true })
  workflowSpec: Contracts.WorkflowSpec | null = null;

  @Property({ type: 'text' })
  difficulty!: Contracts.PromptDifficulty;

  @Index()
  @Property({ type: 'text' })
  status: Opt<Contracts.PromptStatus> = 'active';

  @Property({ type: 'integer' })
  seed!: number;

  @Property({ type: 'varchar', length: 20 })
  generatorVersion!: string;

  @Property({ type: 'boolean' })
  llmEnriched: Opt<boolean> = false;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Opt<Date> = new Date();
}
