import { describe, expect, it } from 'vitest';

import {
  saveStarStorySchema,
  STORY_MAX_TAGS,
  STORY_TAG_MAX_LENGTH,
  STORY_TITLE_MAX_LENGTH,
  type SaveStarStoryRequest,
} from './star-stories';

const story = (overrides: Partial<SaveStarStoryRequest> = {}): SaveStarStoryRequest => ({
  title: 'Kept the on-sale fair',
  situation: 'On-sales spiked to ten thousand concurrent buyers.',
  task: 'Keep reservations responsive through the opening minute.',
  action: 'Introduced a fair queue in front of the reservation path.',
  result: 'The next on-sale sold out with zero oversell.',
  tags: ['scaling'],
  ...overrides,
});

const paths = (input: unknown): string[] => {
  const parsed = saveStarStorySchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((issue) => issue.path.join('.'));
};

describe('saveStarStorySchema', () => {
  it('[STAR-1] stores every value trimmed', () => {
    expect(
      saveStarStorySchema.parse(story({ title: '  Kept the on-sale fair  ', tags: [' scaling '] })),
    ).toMatchObject({ title: 'Kept the on-sale fair', tags: ['scaling'] });
  });

  it('[STAR-1] requires a title and all four STAR sections — whitespace alone is none — and names each', () => {
    expect(
      paths(story({ title: '   ', situation: '', task: '\n', action: '', result: ' ' })),
    ).toEqual(['title', 'situation', 'task', 'action', 'result']);
    expect(paths(story())).toEqual([]);
  });

  it('[STAR-1] bounds a tag’s length and the tag count, and refuses a blank tag, by path', () => {
    expect(paths(story({ tags: ['ok', 'x'.repeat(STORY_TAG_MAX_LENGTH + 1)] }))).toEqual([
      'tags.1',
    ]);
    expect(paths(story({ tags: ['ok', '  '] }))).toEqual(['tags.1']);
    expect(
      paths(story({ tags: Array.from({ length: STORY_MAX_TAGS + 1 }, (_, i) => `t${i}`) })),
    ).toEqual(['tags']);
    expect(paths(story({ title: 'x'.repeat(STORY_TITLE_MAX_LENGTH + 1) }))).toEqual(['title']);
  });

  it('refuses an undeclared key', () => {
    expect(paths({ ...story(), isPublic: true })).toEqual(['']);
  });
});
