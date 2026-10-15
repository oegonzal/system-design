import { textBytes, unitKeyOf, type LandmarkRole, type UnitFacet } from '@sysdesign/contracts';

import type { SessionState } from './session-state';

/**
 * The open unit of work as it reaches the answerer, and what the page stated
 * about it when it opened. A form's question about the unit itself — what the
 * organisation it is for does, why its work matters — can rest only on the
 * unit's own words, and the goal carried none. Measured 2026-10-14 on a live
 * session: a field asked what about the organisation's mission interested the
 * subject, the recall held nothing about the organisation, and the drafter
 * rightly wrote no draft, since the goal stated nothing about the unit but its
 * label, its URL and its declared facets — while the page the unit opened on
 * had stated, under its main landmark, what the organisation is. So a mission
 * declares the landmark whose words are the unit's own statement of itself
 * (`## Unit context`, `unitContextLandmarkOf`), the engine takes that
 * landmark's words from the observation the unit opens on, and the answerer
 * reads them under the open unit.
 */

/**
 * What the page stated under the declared landmark as the unit opened. The
 * landmark is the page's: on a layout that lists other items under the same
 * landmark — measured 2026-10-14 on the shipped mission's results page, where
 * the list of other listings precedes the opened listing's pane — the
 * statement names them too, and the goal says so over it.
 */
export interface UnitContext {
  /** The landmark the mission declared, which the words were read from. */
  landmark: LandmarkRole;
  /** Each node's words on a line of its own, in document order: the whole lines the bound kept. */
  text: string;
  /** The node lines after the bound, not kept — so a reader knows the statement is the landmark's beginning, not its whole. */
  omitted: number;
}

/** The open unit of work as a form goal is composed for it (`formTaskOf`). */
export interface FormTask {
  label: string;
  url: string;
  /** The identity the mission declared, as the plan stated it. */
  facets: readonly UnitFacet[];
  /** The key the recall reads the unit's memories by: the one its answers are taught under. */
  unitKey: string;
  /** What the page stated about the unit when it opened; null when the mission declares no landmark or the page laid out none. */
  context: UnitContext | null;
}

/**
 * The most bytes of a page's statement a unit carries. Measured 2026-10-14
 * over 58 recorded steps that opened a unit with its listing shown — 2 whole
 * snapshots, 56 reduced ones read through the step's observation landmarks:
 * the declared landmark (`main`) held 13–28 KB of words (median 22 KB, 95th
 * percentile 26 KB), two thirds of it the page's list of other items, which
 * share the landmark on the measured layout, with the unit's own description
 * last in document order. The bound sits above the largest recorded page, so
 * the statement at the end is kept whole; a page past the bound is cut at a
 * node boundary, in document order, by this number alone, and the lines cut
 * are counted (`UnitContext.omitted`) so the goal never calls the beginning
 * the whole. What a statement at the bound costs the form goal is the goal
 * composer's to fit (`composeFieldGoalWithinBudget`): the recorded maximum,
 * 28.3 KB, beside the largest recorded form goal, 33.9 KB with its 7.0 KB of
 * evidence, composes to 62.2 of the 64 KB budget with nothing dropped.
 */
export const UNIT_CONTEXT_MAX_BYTES = 30_000;

/**
 * The statement a page makes under the declared landmark, as the unit carries
 * it: each node's words on a line of its own, in document order, as many whole
 * lines as fit the bound — the first line costing its bytes, each next line
 * its bytes and the newline before it — and the count of lines that did not;
 * null when the landmark said nothing, or its first node alone is past the
 * bound, since a node is never cut inside.
 */
export function unitContextOf(
  words: readonly string[],
  landmark: LandmarkRole,
): UnitContext | null {
  const kept: string[] = [];
  let used = 0;
  for (const line of words) {
    const cost = textBytes(line) + (kept.length === 0 ? 0 : 1);
    if (used + cost > UNIT_CONTEXT_MAX_BYTES) break;
    kept.push(line);
    used += cost;
  }
  return kept.length === 0
    ? null
    : { landmark, text: kept.join('\n'), omitted: words.length - kept.length };
}

/**
 * The open unit of work as a form goal is composed for it: the label, url,
 * identity and statement the prose states, and the key the recall reads its
 * unit-bound memories by — the same key the answers given in it are taught
 * under. The statement is read from the session's one store of them, kept by
 * the unit's id for the tasks dump at the close.
 */
export const formTaskOf = (state: SessionState): FormTask | null =>
  state.tasks.open === null
    ? null
    : {
        label: state.tasks.open.label,
        url: state.tasks.open.url,
        facets: [...state.tasks.open.facets],
        unitKey: unitKeyOf(state.tasks.open),
        context: state.tasks.contexts.get(state.tasks.open.id) ?? null,
      };
