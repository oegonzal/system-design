import { describe, expect, it } from 'vitest';

import { emptyLedger, listingObservation, MISSION_FIXTURE } from './fixtures';
import {
  MissionStopMalformed,
  STOPS_BOUND,
  STOPS_HEADING,
  stopsOf,
  stopsOnPage,
} from './mission-stops';
import { composeStepGoal, readStepIndex } from './step-goal';

/** The fixture mission with its Stop conditions replaced by the given bullets. */
const withStops = (bullets: string): string =>
  MISSION_FIXTURE.replace(
    /## Stop conditions\n\n[\s\S]*?(?=\n## )/,
    `${STOPS_HEADING}\n\n${bullets}\n`,
  );

describe('the stop conditions a mission declares', () => {
  it('[BRW-8] reads every bullet as a cause, the words the page shows when it holds, and the meaning — the words optional', () => {
    expect(stopsOf(MISSION_FIXTURE)).toEqual([
      {
        cause: 'limit-reached',
        token: 'no more applications',
        meaning: 'the site says no more applications are allowed today.',
      },
      { cause: 'login-wall', token: null, meaning: 'a sign-in form appears.' },
      { cause: 'mission-complete', token: null, meaning: 'no listing is left.' },
    ]);
    expect(stopsOf('# Mission\n\nNo stops declared.\n')).toEqual([]);
    // A cause may be tied to several words, one bullet each; a meaning may quote.
    expect(
      stopsOf(
        withStops(
          '- limit-reached "limit": the daily limit.\n- limit-reached "try again": asked to come back.\n- login-wall: a "confirm it is you" page.',
        ),
      ).map((stop) => [stop.cause, stop.token]),
    ).toEqual([
      ['limit-reached', 'limit'],
      ['limit-reached', 'try again'],
      ['login-wall', null],
    ]);
  });

  it('[BRW-8] refuses a mission whose Stop conditions hold a line the grammar does not read or a cause the vocabulary does not know, naming the line', () => {
    expect(() => stopsOf(withStops('- limit-reached — no colon'))).toThrow(MissionStopMalformed);
    expect(() => stopsOf(withStops('- out-of-credit: the balance is gone.'))).toThrow(
      /not a stop condition — expected .*: - out-of-credit: the balance is gone\./,
    );
    const many = Array.from(
      { length: STOPS_BOUND.ceiling + 1 },
      (_, i) => `- blocked "w${i}": meaning ${i}.`,
    );
    expect(() => stopsOf(withStops(many.join('\n')))).toThrow();
  });

  it('[BRW-8] says, for each cause tied to words, whether this page shows them — by an element’s name or words or a snapshot line, exactly as written', () => {
    const observation = listingObservation();
    const stops = stopsOf(
      withStops(
        '- limit-reached "no more applications": none left today.\n- login-wall "Globex": the house account.\n- blocked "globex": lower case is another word.\n- mission-complete: no listing is left.',
      ),
    );
    expect(stopsOnPage(stops, observation)).toEqual([
      { cause: 'limit-reached', token: 'no more applications', shown: false },
      { cause: 'login-wall', token: 'Globex', shown: true },
      { cause: 'blocked', token: 'globex', shown: false },
    ]);
    expect(
      stopsOnPage(stops, { elements: [], ariaSnapshot: '- text: no more applications today' })[0],
    ).toEqual({ cause: 'limit-reached', token: 'no more applications', shown: true });
  });

  it('[BRW-8] the composer writes the tied causes into the index and tells the planner what each needs and what this page shows', () => {
    const compose = (mission: string): string =>
      composeStepGoal({
        mission,
        observation: listingObservation(),
        history: [],
        ledger: emptyLedger(),
        objections: [],
        progress: { criteria: [], settled: [], done: [] },
        pageUnchanged: false,
        lastRan: [],
      });
    const goal = compose(
      withStops(
        '- limit-reached "no more applications": none left today.\n- limit-reached "try again": asked to come back.\n- login-wall "Globex": the house account.\n- mission-complete: no listing is left.',
      ),
    );
    expect(readStepIndex(goal)?.stops).toEqual([
      { cause: 'limit-reached', token: 'no more applications', shown: false },
      { cause: 'limit-reached', token: 'try again', shown: false },
      { cause: 'login-wall', token: 'Globex', shown: true },
    ]);
    expect(goal).toContain(
      '- A terminate is cut unless this page shows the words the mission ties to its cause — limit-reached needs "no more applications" or "try again"; login-wall needs "Globex". This page shows "Globex".',
    );
    // A mission that ties no cause to words writes no entry and says nothing.
    const plain = compose(withStops('- mission-complete: no listing is left.'));
    expect(readStepIndex(plain)?.stops).toEqual([]);
    expect(plain).not.toContain('A terminate is cut unless');
    expect(compose(MISSION_FIXTURE)).toContain('This page shows none of them.');
  });
});
