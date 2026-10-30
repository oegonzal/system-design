import { describe, expect, it } from 'vitest';

import { MEMORY_REFUSALS, MEMORY_SPACE_NAME_MAX_LENGTH, spaceNameSchema } from './memory';
import {
  isSpaceRefusal,
  SPACE_HOST_REFUSALS,
  SPACE_REFUSAL_MISSING,
  SPACE_REFUSAL_STATUS,
  SPACE_REFUSALS,
} from './space-host';

describe('the space routes’ refusals', () => {
  it('[AGS-12] are the runtime’s and the host’s, each with one status, every 404 naming what is missing', () => {
    expect([...SPACE_REFUSALS]).toEqual([...MEMORY_REFUSALS, ...SPACE_HOST_REFUSALS]);
    expect(new Set(SPACE_REFUSALS).size).toBe(SPACE_REFUSALS.length);
    for (const code of SPACE_REFUSALS) {
      expect([404, 409, 422], code).toContain(SPACE_REFUSAL_STATUS[code]);
    }
    const notFound = SPACE_REFUSALS.filter((code) => SPACE_REFUSAL_STATUS[code] === 404);
    expect(Object.keys(SPACE_REFUSAL_MISSING).sort()).toEqual([...notFound].sort());
    // A name another run holds, or a claim that lost its race, has moved on: 409, like a lost write.
    expect(SPACE_REFUSAL_STATUS['space.name_taken']).toBe(SPACE_REFUSAL_STATUS.conflict);
  });

  it('[AGS-12] are told from any other string', () => {
    for (const code of SPACE_REFUSALS) expect(isSpaceRefusal(code), code).toBe(true);
    for (const other of ['space.renamed', 'conflict ', 'CONFLICT', '']) {
      expect(isSpaceRefusal(other), other).toBe(false);
    }
  });
});

describe('a space name', () => {
  it('[AGS-12] is a lower-case word of letters, digits and hyphens, starting with a letter, within the one declared bound', () => {
    for (const name of [
      'a',
      'team-notes',
      'space-2',
      `a${'b'.repeat(MEMORY_SPACE_NAME_MAX_LENGTH - 1)}`,
    ]) {
      expect(spaceNameSchema.safeParse(name).success, name).toBe(true);
    }
    for (const name of [
      '',
      '-notes',
      '2notes',
      'Team',
      'team notes',
      'team_notes',
      'team.notes',
      `a${'b'.repeat(MEMORY_SPACE_NAME_MAX_LENGTH)}`,
    ]) {
      expect(spaceNameSchema.safeParse(name).success, name).toBe(false);
    }
  });
});
