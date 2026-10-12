import { describe, expect, it } from 'vitest';

import { listingObservation, MISSION_FIXTURE, stepGoalInput } from './fixtures';
import {
  MissionStopMalformed,
  STOPS_BOUND,
  STOPS_HEADING,
  stopsOf,
  stopsOnPage,
} from './mission-stops';
import { composeStepGoal } from './step-goal';
import { readStepIndex } from './step-index';

/** The fixture mission with its Stop conditions replaced by the given bullets. */
const withStops = (bullets: string): string =>
  MISSION_FIXTURE.replace(
    /## Stop conditions\n\n[\s\S]*?(?=\n## )/,
    `${STOPS_HEADING}\n\n${bullets}\n`,
  );

describe('the stop conditions a mission declares', () => {
  it("[BRW-8] reads every bullet as the mission's cause word, the status it ends the session in and the words the page shows when it holds — the words optional, the meaning the mission's own prose", () => {
    expect(stopsOf(MISSION_FIXTURE)).toEqual([
      { cause: 'limit-reached', ending: 'complete', token: 'no more applications' },
      { cause: 'login-wall', ending: 'stopped', token: null },
      { cause: 'mission-complete', ending: 'complete', token: null },
    ]);
    expect(stopsOf('# Mission\n\nNo stops declared.\n')).toEqual([]);
    // A bullet still has to say what the cause means.
    expect(() => stopsOf(withStops('- login-wall (stopped):'))).toThrow(MissionStopMalformed);
    // A cause may be tied to several words, one bullet each; a meaning may quote.
    expect(
      stopsOf(
        withStops(
          '- limit-reached (complete) "limit": the daily limit.\n- limit-reached (complete) "try again": asked to come back.\n- login-wall (stopped): a "confirm it is you" page.',
        ),
      ).map((stop) => [stop.cause, stop.token]),
    ).toEqual([
      ['limit-reached', 'limit'],
      ['limit-reached', 'try again'],
      ['login-wall', null],
    ]);
  });

  it('[BRW-8] reads any cause the mission names, and refuses a line the grammar does not read, an ending it does not know, or a cause given two endings, naming the line', () => {
    // The cause is the mission's word: the engine knows none of them.
    expect(stopsOf(withStops('- out-of-credit (stopped): the balance is gone.'))).toEqual([
      { cause: 'out-of-credit', ending: 'stopped', token: null },
    ]);
    expect(() => stopsOf(withStops('- limit-reached — no colon'))).toThrow(MissionStopMalformed);
    // No ending: the status a stop leaves the session in is never implied.
    expect(() => stopsOf(withStops('- out-of-credit: the balance is gone.'))).toThrow(
      /not a stop condition — expected .*: - out-of-credit: the balance is gone\./,
    );
    expect(() => stopsOf(withStops('- out-of-credit (paused): the balance is gone.'))).toThrow(
      MissionStopMalformed,
    );
    expect(() =>
      stopsOf(
        withStops(
          '- limit-reached (complete) "limit": a.\n- limit-reached (stopped) "try again": b.',
        ),
      ),
    ).toThrow(/one ending per cause/);
    const many = Array.from(
      { length: STOPS_BOUND.ceiling + 1 },
      (_, i) => `- blocked (stopped) "w${i}": meaning ${i}.`,
    );
    expect(() => stopsOf(withStops(many.join('\n')))).toThrow();
  });

  it('[BRW-8] says, for each cause tied to words, whether this page shows them — by an element’s name or words or a snapshot line, exactly as written', () => {
    const observation = listingObservation();
    const stops = stopsOf(
      withStops(
        '- limit-reached (complete) "no more applications": none left today.\n- login-wall (stopped) "Globex": the house account.\n- blocked (stopped) "globex": lower case is another word.\n- mission-complete (complete): no listing is left.',
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

  it("[BRW-8] the composer writes every declared cause and the tied ones' words into the index, and tells the planner which causes exist, what each tied one needs and what this page shows", () => {
    const compose = (mission: string): string => composeStepGoal(stepGoalInput({ mission }));
    const goal = compose(
      withStops(
        '- limit-reached (complete) "no more applications": none left today.\n- limit-reached (complete) "try again": asked to come back.\n- login-wall (stopped) "Globex": the house account.\n- mission-complete (complete): no listing is left.',
      ),
    );
    expect(readStepIndex(goal)?.causes).toEqual([
      'limit-reached',
      'login-wall',
      'mission-complete',
    ]);
    expect(goal).toContain(
      "- A terminate names one of the causes the mission's Stop conditions declare: limit-reached, login-wall, mission-complete.",
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
    const plain = compose(withStops('- mission-complete (complete): no listing is left.'));
    expect(readStepIndex(plain)?.stops).toEqual([]);
    expect(readStepIndex(plain)?.causes).toEqual(['mission-complete']);
    expect(plain).not.toContain('A terminate is cut unless');
    expect(compose(MISSION_FIXTURE)).toContain('This page shows none of them.');
  });
});
