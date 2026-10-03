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
type ContractStatuses = (typeof Contracts)['PROMPT_STATUSES'];
const STATUSES = ['active', 'archived'] as const satisfies ContractStatuses;

type ContractSources = (typeof Contracts)['PROMPT_SOURCES'];
const SOURCES = ['authored', 'generated', 'library'] as const satisfies ContractSources;

/**
 * A design prompt: one markdown document plus the criteria the quality loop
 * derived from it. The markdown is the goal every grading run reads verbatim;
 * the criteria are derived once and kept for the prompt's life, so a brief
 * written against `c3` still means `c3` on the next revision. Nothing
 * structured about the prompt lives outside the text.
 */
@Entity()
@Check({
  name: 'prompt_status_check',
  expression: `status in (${STATUSES.map((s) => `'${s}'`).join(', ')})`,
})
@Check({
  name: 'prompt_source_check',
  expression: `source in (${SOURCES.map((s) => `'${s}'`).join(', ')})`,
})
export class Prompt {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  /**
   * The experience a generated prompt was drawn from; null for authored and
   * library prompts. restrict: experiences are seeded reference data.
   */
  @Index()
  @ManyToOne(() => ExperienceProfile, { deleteRule: 'restrict', nullable: true })
  experience: Rel<ExperienceProfile> | null = null;

  /** Bounded by `PROMPT_TITLE_BOUND` at the edge, never by a column width. */
  @Property({ type: 'text' })
  title!: string;

  @Property({ type: 'text' })
  markdown!: string;

  /** Empty until derived; `PromptsService.ensureCriteria` fills it on first read. */
  @Property({ type: 'json' })
  criteria: Opt<Contracts.SuccessCriterion[]> = [];

  @Property({ type: 'text' })
  source!: Contracts.PromptSource;

  @Index()
  @Property({ type: 'text' })
  status: Opt<Contracts.PromptStatus> = 'active';

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Opt<Date> = new Date();
}
