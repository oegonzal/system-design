import { describe, expect, it } from 'vitest';

import {
  listingObservation,
  MISSION_FIXTURE,
  MISSION_WITH_IDENTITY,
  MISSION_WITH_TAKEN,
  observedElement,
} from '../browser-session/fixtures';
import {
  MissionTakenMalformed,
  TAKEN_BOUND,
  TAKEN_HEADING,
  takenOf,
  takenOnPage,
  takenOpenOn,
  takenStancesOf,
} from './mission-taken';

const withTaken = (lines: string): string =>
  `${MISSION_WITH_IDENTITY}\n${TAKEN_HEADING}\n\n${lines}\n`;

describe('what a mission declares about taking a unit on record', () => {
  it('[BRW-13] reads the stance and the control each exception is tied to, in order, and the stances once; none from a mission without the section', () => {
    expect(takenOf(MISSION_FIXTURE)).toEqual([]);
    expect(takenOf(MISSION_WITH_TAKEN)).toEqual([{ stance: 'avoid', control: 'Next page' }]);
    expect(takenOf(withTaken('- avoid: when the procedure says so.'))).toEqual([
      { stance: 'avoid', control: null },
    ]);
    const two = withTaken('- avoid unless "Next": meaning.\n- avoid unless "More": meaning.');
    expect(takenOf(two)).toEqual([
      { stance: 'avoid', control: 'Next' },
      { stance: 'avoid', control: 'More' },
    ]);
    expect(takenStancesOf(two)).toEqual(['avoid']);
    expect(takenStancesOf(MISSION_FIXTURE)).toEqual([]);
  });

  it('[BRW-13] refuses a stance the vocabulary never takes, a bullet the grammar does not read, a stance declared both with and without a control, a control declared twice, and more than the bound, naming the line', () => {
    expect(() => takenOf(withTaken('- forbid: never, whatever the page.'))).toThrow(
      MissionTakenMalformed,
    );
    expect(() => takenOf(withTaken('- avoid unless Next: no quotes.'))).toThrow(
      /is not an exception — expected/,
    );
    expect(() => takenOf(withTaken('- avoid: m.\n- avoid unless "Next": m.'))).toThrow(
      /: - avoid unless "Next": m\.$/,
    );
    expect(() => takenOf(withTaken('- avoid unless "Next": m.\n- avoid: m.'))).toThrow(
      /: - avoid: m\.$/,
    );
    expect(() =>
      takenOf(withTaken('- avoid unless "Next": m.\n- avoid unless "Next": again.')),
    ).toThrow(/: - avoid unless "Next": again\.$/);
    const many = Array.from(
      { length: TAKEN_BOUND.ceiling + 1 },
      (_, i) => `- avoid unless "Control ${i}": meaning ${i}.`,
    );
    expect(() => takenOf(withTaken(many.join('\n')))).toThrow();
  });

  it('[BRW-13] an exception is withheld while this page lists a control of exactly that name a plan could act on — never a name containing it, a disabled one or one not visible — and is open where it is tied to none', () => {
    const declared = takenOf(MISSION_WITH_TAKEN);
    expect(takenOnPage(declared, listingObservation())).toEqual([
      { stance: 'avoid', control: 'Next page', shown: true },
    ]);
    const without = {
      elements: [
        observedElement('e1', 'button', 'Next page two'),
        observedElement('e2', 'button', 'Next page', { disabled: true }),
        observedElement('e3', 'button', 'Next page', { visible: false }),
      ],
    };
    expect(takenOnPage(declared, without)).toEqual([
      { stance: 'avoid', control: 'Next page', shown: false },
    ]);
    expect(takenOnPage(takenOf(withTaken('- avoid: m.')), listingObservation())).toEqual([
      { stance: 'avoid', control: null, shown: false },
    ]);
    expect(
      takenOpenOn([
        { stance: 'avoid', control: 'Next page', shown: true },
        { stance: 'avoid', control: 'More', shown: false },
      ]),
    ).toEqual([]);
    expect(takenOpenOn([{ stance: 'avoid', control: 'More', shown: false }])).toEqual(['avoid']);
    expect(takenOpenOn([])).toEqual([]);
  });
});
