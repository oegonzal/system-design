import { z } from 'zod';

import { bound, bounded } from '../bounds';
import { bulletsUnder } from './mission-sections';
import type { PageObservation } from './observation.schema';
import { TERMINATE_CAUSES } from './vocab';

/**
 * Stop conditions: why a plan may end the session, declared by the mission
 * under its own heading, one bullet per cause — and, where the mission can,
 * the words the page shows when the cause holds:
 *
 *     ## Stop conditions
 *
 *     - limit-reached "limit": the site says the daily application limit is reached.
 *     - mission-complete: no listing is left.
 *
 * A cause tied to words is checked, not believed: the composer writes into
 * the step index whether this page shows them, and the limits validator cuts
 * a terminate for that cause on a page that does not. A cause tied to no
 * words stays the judges' to assess. Measured 2026-10-08: a session ended
 * `limit-reached` on a results page none of whose 31 snapshots carried the
 * word "limit" — one critic's sentence about a mark had become the next
 * plan's only objection, the planner obeyed it, and the evaluator read the
 * same words. The engine never names a word; the mission does.
 */

export const STOPS_HEADING = '## Stop conditions';
/** The most stop conditions a mission declares: one bullet per cause, a cause tied to several words once per word. */
export const STOPS_BOUND = bound(8, 'list');
export const STOP_TOKEN_MAX_LENGTH = 60;
export const STOP_MEANING_BOUND = bound(300);

const stopConditionSchema = z.strictObject({
  cause: z.enum(TERMINATE_CAUSES),
  /** The exact text the page shows when the cause holds, matched as written; null when the mission ties the cause to no words. */
  token: bounded.id(STOP_TOKEN_MAX_LENGTH, { min: 1 }).nullable(),
  /** What the mission says the cause means, for the planner. */
  meaning: bounded.text(STOP_MEANING_BOUND, { min: 1 }),
});
const stopConditionsSchema = bounded.list(STOPS_BOUND, stopConditionSchema);
export type StopCondition = z.infer<typeof stopConditionSchema>;

/** A stop condition the mission ties to words, as this page bears on it: the step index's entry. */
export interface StopOnPage {
  cause: StopCondition['cause'];
  token: string;
  shown: boolean;
}

/** One bullet: the cause word, an optional quoted token, a colon, the meaning. */
const STOP_LINE = /^- (?<cause>[a-z-]+)(?: "(?<token>[^"]+)")?: (?<meaning>.+)$/;

/** A Stop conditions bullet the grammar does not read; the mission is refused before any page is. */
export class MissionStopMalformed extends Error {
  override readonly name = 'MissionStopMalformed';
  constructor(readonly line: string) {
    super(
      `a line under ${STOPS_HEADING} is not a stop condition — expected \`- <cause>: <meaning>\` or \`- <cause> "<text the page shows>": <meaning>\`, the cause one of ${TERMINATE_CAUSES.join(', ')}: ${line}`,
    );
  }
}

const isCause = (word: string): word is StopCondition['cause'] =>
  (TERMINATE_CAUSES as readonly string[]).includes(word);

/**
 * The stop conditions a mission declares, in order; none when the section is
 * absent. A bullet the grammar does not read, or a cause the vocabulary does
 * not know, refuses the mission.
 */
export function stopsOf(mission: string): StopCondition[] {
  const stops = bulletsUnder(mission, STOPS_HEADING).map((line) => {
    const groups = STOP_LINE.exec(line)?.groups;
    const cause = groups?.['cause'] ?? '';
    if (groups === undefined || !isCause(cause)) throw new MissionStopMalformed(line);
    return { cause, token: groups['token'] ?? null, meaning: groups['meaning'] ?? '' };
  });
  return stopConditionsSchema.parse(stops);
}

/** Whether the page shows a stop's words: in an element's name or words, or in a line of the snapshot, exactly as written. */
const shownOn = (
  token: string,
  observation: Pick<PageObservation, 'elements' | 'ariaSnapshot'>,
): boolean =>
  [
    ...observation.elements.map((element) => `${element.name}\n${element.text ?? ''}`),
    observation.ariaSnapshot,
  ]
    .join('\n')
    .includes(token);

/** The stop conditions tied to words, each with whether this page shows them; a cause tied to no words is not listed. */
export function stopsOnPage(
  stops: readonly StopCondition[],
  observation: Pick<PageObservation, 'elements' | 'ariaSnapshot'>,
): StopOnPage[] {
  return stops.flatMap((stop) =>
    stop.token === null
      ? []
      : [{ cause: stop.cause, token: stop.token, shown: shownOn(stop.token, observation) }],
  );
}
