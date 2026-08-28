import type { Opt, Rel } from '@mikro-orm/core';
import {
  Entity,
  Index,
  ManyToOne,
  PrimaryKey,
  Property,
  Unique,
} from '@mikro-orm/decorators/legacy';

import { ExperienceProfile } from './experience-profile.entity';
import { Prompt } from './prompt.entity';

/**
 * A STAR-method interview story, optionally anchored to the prompt it answers
 * and the experience it comes from. Both links use `set null` on delete: the
 * story is the user's writing and outlives whatever it referenced.
 */
@Entity()
@Index({
  name: 'star_story_tags_gin_index',
  expression: 'create index "star_story_tags_gin_index" on "star_story" using gin ("tags")',
})
export class StarStory {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @Unique()
  @Property({ type: 'varchar', length: 120 })
  title!: string;

  @Property({ type: 'text' })
  situation!: string;

  @Property({ type: 'text' })
  task!: string;

  @Property({ type: 'text' })
  action!: string;

  @Property({ type: 'text' })
  result!: string;

  @Property({ type: 'string[]' })
  tags: string[] = [];

  @ManyToOne(() => Prompt, { deleteRule: 'set null', nullable: true })
  prompt: Rel<Prompt> | null = null;

  @ManyToOne(() => ExperienceProfile, { deleteRule: 'set null', nullable: true })
  experience: Rel<ExperienceProfile> | null = null;

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();

  @Property({ type: 'timestamptz', onUpdate: () => new Date() })
  updatedAt: Opt<Date> = new Date();
}
