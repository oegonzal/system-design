import { describe, expect, it } from 'vitest';

import { MISSION_FIXTURE, MISSION_WITH_IDENTITY } from '../browser-session/fixtures';
import {
  ADVISORS_HEADING,
  advisorsOf,
  IDENTITY_HEADING,
  MissionAdvisorsMalformed,
  MissionIdentityMalformed,
  unitFacetsOf,
} from './mission-identity';
import { ADVISORS_BOUND, UNIT_FACETS_BOUND } from './vocab';

const withIdentity = (lines: string): string =>
  `${MISSION_FIXTURE}\n${IDENTITY_HEADING}\n\n${lines}\n`;
const withAdvisors = (lines: string): string =>
  `${MISSION_FIXTURE}\n${ADVISORS_HEADING}\n\n${lines}\n`;

describe('what a mission declares about its units beyond one session', () => {
  it('[BRW-13] reads the facts that identify a unit by name, in order, and none from a mission without the section', () => {
    expect(unitFacetsOf(MISSION_FIXTURE)).toEqual([]);
    expect(unitFacetsOf(MISSION_WITH_IDENTITY)).toEqual(['company']);
    expect(
      unitFacetsOf(
        withIdentity('- company: the company as the pane names it.\n- notice-id: the id.'),
      ),
    ).toEqual(['company', 'notice-id']);
  });

  it('[BRW-13] refuses a fact the grammar does not read, one declared twice, or more than the bound, naming the line', () => {
    expect(() => unitFacetsOf(withIdentity('- Company: capitals are not a name.'))).toThrow(
      MissionIdentityMalformed,
    );
    expect(() => unitFacetsOf(withIdentity('- company'))).toThrow(/is not a fact — expected/);
    expect(() => unitFacetsOf(withIdentity('- company: the company.\n- company: again.'))).toThrow(
      /declared once: - company: again\./,
    );
    const many = Array.from(
      { length: UNIT_FACETS_BOUND.ceiling + 1 },
      (_, i) => `- fact-${i}: meaning ${i}.`,
    );
    expect(() => unitFacetsOf(withIdentity(many.join('\n')))).toThrow();
  });

  it('[BRW-13] reads the advisors a mission names, each once, and refuses anything but an id', () => {
    expect(advisorsOf(MISSION_FIXTURE)).toEqual([]);
    expect(advisorsOf(withAdvisors('- job-application\n- govcon'))).toEqual([
      'job-application',
      'govcon',
    ]);
    expect(() => advisorsOf(withAdvisors('- job-application: with a note'))).toThrow(
      MissionAdvisorsMalformed,
    );
    expect(() => advisorsOf(withAdvisors('- govcon\n- govcon'))).toThrow(/named once: - govcon/);
    const many = Array.from({ length: ADVISORS_BOUND.ceiling + 1 }, (_, i) => `- advisor-${i}`);
    expect(() => advisorsOf(withAdvisors(many.join('\n')))).toThrow();
  });
});
