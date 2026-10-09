import { z } from 'zod';

import { bound, bounded } from '../bounds';
import { bulletsUnder } from './mission-sections';
import type { PageObservation } from './observation.schema';
import { STOP_ENDINGS } from './vocab';

/**
 * Stop conditions: why a plan may end the session, declared by the mission
 * under its own heading, one bullet per cause — its cause word, the status it
 * leaves the session in, and, where the mission can, the words the page shows
 * when the cause holds:
 *
 *     ## Stop conditions
 *
 *     - limit-reached (complete) "limit": the site says the daily limit is reached.
 *     - mission-complete (complete): no item is left.
 *     - login-wall (stopped) "Sign in": a sign-in form appears.
 *
 * The cause words and their endings are the mission's: the engine reads them
 * back as data, and no cause is the engine's own.
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
export const STOP_CAUSE_MAX_LENGTH = 40;
/** A cause word: lower-case words joined by hyphens, as a mission names it. */
const STOP_CAUSE = /^[a-z][a-z0-9-]*$/;
export const STOP_MEANING_BOUND = bound(300);

const stopConditionSchema = z.strictObject({
  cause: z.string().regex(STOP_CAUSE).max(STOP_CAUSE_MAX_LENGTH),
  /** The status a stop leaves the session in, as the mission declares it. */
  ending: z.enum(STOP_ENDINGS),
  /** The exact text the page shows when the cause holds, matched as written; null when the mission ties the cause to no words. */
  token: bounded.id(STOP_TOKEN_MAX_LENGTH, { min: 1 }).nullable(),
  /** What the mission says the cause means, for the planner. */
  meaning: bounded.text(STOP_MEANING_BOUND, { min: 1 }),
});
const stopConditionsSchema = bounded.list(STOPS_BOUND, stopConditionSchema);
export type StopCondition = z.infer<typeof stopConditionSchema>;

/** A stop condition the mission ties to words, as this page bears on it: the step index's entry. */
export interface StopOnPage {
  cause: string;
  token: string;
  shown: boolean;
}

/** One bullet: the cause word, its ending in parentheses, an optional quoted token, a colon, the meaning. */
const STOP_LINE =
  /^- (?<cause>[a-z][a-z0-9-]*) \((?<ending>[a-z]+)\)(?: "(?<token>[^"]+)")?: (?<meaning>.+)$/;

/** A Stop conditions bullet the grammar does not read; the mission is refused before any page is. */
export class MissionStopMalformed extends Error {
  override readonly name = 'MissionStopMalformed';
  constructor(readonly line: string) {
    super(
      `a line under ${STOPS_HEADING} is not a stop condition — expected \`- <cause> (<ending>): <meaning>\` or \`- <cause> (<ending>) "<text the page shows>": <meaning>\`, the ending one of ${STOP_ENDINGS.join(', ')}, and one ending per cause: ${line}`,
    );
  }
}

/**
 * The stop conditions a mission declares, in order; none when the section is
 * absent. A bullet the grammar does not read, an ending the vocabulary does
 * not know, or a cause declared twice with two endings refuses the mission.
 */
export function stopsOf(mission: string): StopCondition[] {
  const endings = new Map<string, string>();
  const stops = bulletsUnder(mission, STOPS_HEADING).map((line) => {
    const groups = STOP_LINE.exec(line)?.groups;
    if (groups === undefined) throw new MissionStopMalformed(line);
    const cause = groups['cause'] ?? '';
    const ending = groups['ending'] ?? '';
    if (endings.has(cause) && endings.get(cause) !== ending) throw new MissionStopMalformed(line);
    endings.set(cause, ending);
    const parsed = stopConditionSchema.safeParse({
      cause,
      ending,
      token: groups['token'] ?? null,
      meaning: groups['meaning'] ?? '',
    });
    if (!parsed.success) throw new MissionStopMalformed(line);
    return parsed.data;
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
