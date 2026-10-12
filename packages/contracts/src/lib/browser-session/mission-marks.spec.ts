import { describe, expect, it } from 'vitest';

import { listingObservation, MISSION_FIXTURE } from './fixtures';
import { MARKS_BOUND, marksOf, marksOn, MissionMarkMalformed } from './mission-marks';

const withMarks = (lines: string): string => `${MISSION_FIXTURE}\n\n## Marks\n\n${lines}\n`;

describe('the marks a mission declares', () => {
  it('[BRW-8] reads every bullet of the Marks section as its token — the meaning stays the mission’s prose — and none from a mission without one', () => {
    expect(marksOf(MISSION_FIXTURE)).toEqual([]);
    expect(
      marksOf(withMarks('- "Applied ·": applied to before.\n- "Sold out": nothing left to buy.')),
    ).toEqual([{ token: 'Applied ·' }, { token: 'Sold out' }]);
    // The section ends at the next heading; a blank line is not a mark.
    expect(
      marksOf(`${withMarks('- "Read": seen already.')}\n## Afterword\n\n- "not a mark"\n`),
    ).toEqual([{ token: 'Read' }]);
    // A bullet still has to say what the mark means: a token alone is not a mark.
    expect(() => marksOf(withMarks('- "Applied ·":'))).toThrow(MissionMarkMalformed);
  });

  it('[BRW-8] refuses a mission whose Marks section holds a line the grammar does not read, naming the line', () => {
    expect(() => marksOf(withMarks('- Applied: without its quotes'))).toThrow(MissionMarkMalformed);
    expect(() => marksOf(withMarks('- "Applied" — no colon'))).toThrow(
      /not a mark — expected `- "<text the page writes>": <what it means>`: - "Applied" — no colon/,
    );
    // Past the bound the list is a size fault, refused by the schema.
    const many = Array.from(
      { length: MARKS_BOUND.ceiling + 1 },
      (_, i) => `- "m${i}": meaning ${i}.`,
    );
    expect(() => marksOf(withMarks(many.join('\n')))).toThrow();
  });

  it('[BRW-8] finds a mark in an element by its name, or by its words when it has no name, exactly as written', () => {
    const marks = marksOf(
      withMarks('- "Applied ·": applied to before.\n- "Globex": not this one.'),
    );
    const [search, , , globex] = listingObservation().elements;
    expect(marksOn(globex, marks).map((mark) => mark.token)).toEqual(['Globex']);
    expect(marksOn(search, marks)).toEqual([]);
    expect(
      marksOn(
        { name: 'Senior Engineer Acme Applied · Posted 3 weeks ago · Easy Apply', text: null },
        marks,
      ),
    ).toEqual([{ token: 'Applied ·' }]);
    // "Easy Apply" is not "Applied ·", and case counts: a mark is the page's text as written.
    expect(marksOn({ name: 'Easy Apply', text: null }, marks)).toEqual([]);
    expect(marksOn({ name: '', text: 'applied · yesterday' }, marks)).toEqual([]);
    expect(marksOn({ name: '', text: 'Applied · yesterday' }, marks)).toHaveLength(1);
  });
});
