'use client';

import {
  DEFAULT_LIST_LIMIT,
  type ExperienceProfileDto,
  type PromptDto,
} from '@sysdesign/contracts';
import { useResource } from '@sysdesign/web-kit';

import { api } from '../../api/client';

/** How many prompts a story can be linked to from the form — the list's own page. */
const LINKABLE_PROMPTS = DEFAULT_LIST_LIMIT;

export interface StoryLinkOptions {
  prompts: PromptDto[];
  experiences: ExperienceProfileDto[];
}

const NONE: StoryLinkOptions = { prompts: [], experiences: [] };

/**
 * What a story can link to. A convenience, not a dependency: while the
 * options are missing — loading, or failed — the form still works, just
 * without them, so a failure here never blocks writing a story.
 */
export function useStoryLinkOptions(): StoryLinkOptions {
  const options = useResource(async (signal) => {
    const [prompts, experiences] = await Promise.all([
      api.listPrompts({ limit: LINKABLE_PROMPTS }, { signal }),
      api.listExperiences({ signal }),
    ]);
    return { prompts: prompts.data, experiences: experiences.data };
  }, []);
  return options.data ?? NONE;
}
