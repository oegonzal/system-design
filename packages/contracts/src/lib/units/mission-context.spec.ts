import { describe, expect, it } from 'vitest';

import { MISSION_FIXTURE, MISSION_WITH_CONTEXT } from '../browser-session/fixtures';
import { CONTEXT_HEADING, MissionContextMalformed, unitContextLandmarkOf } from './mission-context';

const withContext = (lines: string): string =>
  `${MISSION_FIXTURE}\n${CONTEXT_HEADING}\n\n${lines}\n`;

describe('what a mission declares about where a page states what a unit is', () => {
  it('[BRW-16] reads the declared landmark, and none from a mission without the section', () => {
    expect(unitContextLandmarkOf(MISSION_FIXTURE)).toBeNull();
    expect(unitContextLandmarkOf(MISSION_WITH_CONTEXT)).toBe('main');
    expect(unitContextLandmarkOf(withContext('- landmark: complementary'))).toBe('complementary');
  });

  it('[BRW-16] refuses a role the vocabulary does not name, a line the grammar does not read, and a second landmark, naming the line', () => {
    expect(() => unitContextLandmarkOf(withContext('- landmark: sidebar'))).toThrow(
      MissionContextMalformed,
    );
    expect(() => unitContextLandmarkOf(withContext('- landmark: sidebar'))).toThrow(
      /declared once: - landmark: sidebar$/,
    );
    expect(() => unitContextLandmarkOf(withContext('- landmark: Main'))).toThrow(
      MissionContextMalformed,
    );
    expect(() => unitContextLandmarkOf(withContext('- main'))).toThrow(
      /is not a landmark — expected/,
    );
    expect(() =>
      unitContextLandmarkOf(withContext('- landmark: main\n- landmark: banner')),
    ).toThrow(/declared once: - landmark: banner$/);
  });
});
