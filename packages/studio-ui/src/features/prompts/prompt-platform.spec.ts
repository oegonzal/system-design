import { PLATFORM_IDS, platformCatalogue } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { makePrompt } from '../../testing/fixtures';
import { platformLabel, promptPlatform } from './prompt-platform';

describe('promptPlatform', () => {
  it('[GEN-7] resolves a prompt’s declared platform to its catalogue, and a neutral or absent prompt to none', () => {
    const [platform] = PLATFORM_IDS;
    expect(promptPlatform(makePrompt({ platform }))).toBe(platformCatalogue(platform));
    expect(promptPlatform(makePrompt())).toBeNull();
    expect(promptPlatform(null)).toBeNull();
    expect(platformLabel(platform)).toBe(platformCatalogue(platform).label);
  });
});
