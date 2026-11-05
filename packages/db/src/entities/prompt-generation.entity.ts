import type { Opt, Rel } from '@mikro-orm/core';
import type * as Contracts from '@sysdesign/contracts';
import { Entity, ManyToOne, OneToOne, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

import { ExperienceProfile } from './experience-profile.entity';
import { Prompt } from './prompt.entity';

/**
 * One prompt-generation run, keyed by the quality-loop run id it started.
 * Exists so the claim is restart-safe and idempotent: the experience the run
 * was drawn from is remembered here rather than round-tripped through the
 * client, and `prompt` is set exactly once when the run's best draft is
 * claimed into a Prompt.
 */
@Entity()
export class PromptGeneration {
  /** The quality loop's own run id — the dump folder's name and the poll key. */
  @PrimaryKey({ type: 'varchar', length: 80 })
  runId!: string;

  @ManyToOne(() => ExperienceProfile, { deleteRule: 'restrict', nullable: true })
  experience: Rel<ExperienceProfile> | null = null;

  /** Set when claimed; unique, so a race between two polls creates one prompt. */
  @OneToOne(() => Prompt, { deleteRule: 'cascade', nullable: true, owner: true })
  prompt: Rel<Prompt> | null = null;

  /** The format the draft was asked for, copied to the prompt when the draft is claimed. */
  @Property({ type: 'text' })
  format: Opt<Contracts.PracticeFormatId> = 'system';

  /** The platform the prompt was asked for, copied to the prompt when the draft is claimed; the writer never sees it. */
  @Property({ type: 'text', nullable: true })
  platform: Contracts.PlatformId | null = null;

  @Property({ type: 'timestamptz' })
  startedAt: Opt<Date> = new Date();
}
