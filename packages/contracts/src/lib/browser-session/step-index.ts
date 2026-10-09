/**
 * The index a step goal carries for its validators: every ref with the facts a
 * plan is checked against, whether the page shows anything, what ran on an
 * unchanged page, and the words the mission ties a stop cause to. The
 * composer writes it as the goal's last fenced block, the validators read it
 * back, and a model is shown the goal without it.
 */
import { z } from 'zod';

import { bounded } from '../bounds';
import { readFencedIndex } from '../quality-loop/goal-index';
import { STEP_ACTION_KINDS } from './action-effects';
import { refNowOf, type RanAction } from './action-identity';
import { ELEMENT_KINDS } from './element-kind';
import { MARK_TOKEN_MAX_LENGTH, marksOn, type Mark } from './mission-marks';
import { STOP_TOKEN_MAX_LENGTH, type StopOnPage } from './mission-stops';
import {
  ELEMENT_REF,
  inScope,
  OPTIONS_SHOWN,
  type ObservedElement,
  type PageObservation,
} from './observation.schema';
import { BROWSER_STEP_PIPELINE_ID } from './pipelines';
import { ACTIONS_BOUND, type StepAction } from './step-plan.schema';
import { HIDDEN_TRAITS, TERMINATE_CAUSES } from './vocab';

/**
 * What the last step did, as the next plan is told it — engine facts, never a
 * ref (a ref belongs to one observation): how many of the plan's actions ran,
 * the page actions among them as the page would recognise them again, and the
 * kinds it proposed after them that did not run. Measured 2026-10-08: told
 * only "not-executed … past the executable prefix", a planner whose click had
 * opened a listing clicked a card again on the next page instead of opening
 * the unit, twelve steps of 23.
 */
export interface LastStep {
  /** How many of the plan's actions ran without failing, the session's own events included. */
  ran: number;
  /** The page actions that ran, as the page would recognise them again; the last one led here. */
  touched: readonly RanAction[];
  /** The kinds the plan proposed after what ran, which did not run. */
  held: readonly StepAction['kind'][];
}

/** The page as the step sees it: what was observed, whether the last plan moved it, and what the last step did. */
export interface StepPageState {
  observation: PageObservation;
  /**
   * Whether this is the page the last plan was made against, unchanged: the
   * recent actions moved nothing on it. Said in the goal, because a recent
   * action marked ok reads as a step that worked. Measured 2026-10-07: a
   * producer pressed Enter and Tab on one unchanged dialog for twenty steps,
   * each press "ok".
   */
  pageUnchanged: boolean;
  /**
   * What the last step did; null before the first plan. On an unchanged page a
   * repeat of what it touched is cut: the page already answered it. Measured
   * 2026-10-08: nine steps of 31 were one click on one already-selected card,
   * repeated.
   */
  lastStep: LastStep | null;
}

/** The facts the validators check a plan against; everything else in the goal is for the model. */
export const stepIndexSchema = z.strictObject({
  pipeline: z.literal(BROWSER_STEP_PIPELINE_ID),
  maxActions: z.number().int().min(1),
  elements: z.array(
    z.strictObject({
      ref: z.string().regex(ELEMENT_REF),
      kind: z.enum(ELEMENT_KINDS),
      // Written only where it deviates — the read-back fills every default — so
      // an index of 150 elements costs what its deviations cost. Measured
      // 2026-10-08: 137 of 150 entries carried default facts alone.
      disabled: z.boolean().default(false),
      visible: z.boolean().default(true),
      /** Outside the open modal dialog: a person could not reach it. */
      behind: z.boolean().default(false),
      options: z.array(z.string()).nullable().default(null),
      /** Options the page offers past the listed ones; a select is held to the list only when this is zero. */
      optionsOmitted: z.number().int().min(0).default(0),
      hiddenTraits: z.array(z.enum(HIDDEN_TRAITS)).default([]),
      /** The mission's marks this element carries, by token; a marked element is passed over, never touched. */
      marks: z.array(bounded.id(MARK_TOKEN_MAX_LENGTH, { min: 1 })).default([]),
    }),
  ),
  /**
   * Whether the observation shows anything at all — a listed element, or a
   * snapshot at a rung above none. A terminate names a stop condition the page
   * shows and a taskDone an outcome the page shows; on a page that shows
   * nothing there is nothing for either to rest on, and the validators refuse
   * them there so the most consequential actions in the vocabulary never rest
   * on a claim alone. A snapshot at the none rung is its note line — text
   * that says nothing is shown — and an empty document is an empty snapshot
   * at the full rung; neither shows a thing.
   */
  pageShowsContent: z.boolean(),
  /** Whether this is the page the last plan was made against, unchanged. Written only when it is. */
  pageUnchanged: z.boolean().default(false),
  /**
   * What ran at the last step on this unchanged page, by this observation's
   * refs — null where the page no longer lists the element, or the action
   * named none. An action equal in kind, ref and detail is cut. Written only
   * when the page is unchanged.
   */
  lastRan: z
    .array(
      z.strictObject({
        kind: z.enum(STEP_ACTION_KINDS),
        ref: z.string().regex(ELEMENT_REF).nullable(),
        detail: z.string().nullable(),
      }),
    )
    .max(ACTIONS_BOUND.ceiling)
    .default([]),
  /**
   * The stop conditions the mission ties to words on the page, and whether
   * this page shows them. A terminate for a tied cause is cut when none of
   * its words is shown; a cause tied to no words is not listed and is the
   * judges' to assess. Written only when the mission ties a cause to words.
   */
  stops: z
    .array(
      z.strictObject({
        cause: z.enum(TERMINATE_CAUSES),
        token: bounded.id(STOP_TOKEN_MAX_LENGTH, { min: 1 }),
        shown: z.boolean(),
      }),
    )
    .default([]),
});
export type StepIndex = z.infer<typeof stepIndexSchema>;

/** The first `OPTIONS_SHOWN` options, then a count of those the page offers past them, so a cut list never reads as the whole. */
export const shownOptions = (
  element: Pick<ObservedElement, 'options' | 'optionsOmitted'>,
): { shown: string[]; more: number } => {
  const options = element.options ?? [];
  const shown = options.slice(0, OPTIONS_SHOWN);
  return { shown, more: options.length - shown.length + element.optionsOmitted };
};

/** The index for this page: every fact a validator checks a plan against, the defaults left unwritten. */
export const indexOf = (
  page: StepPageState,
  marks: readonly Mark[],
  stops: readonly StopOnPage[],
): z.input<typeof stepIndexSchema> => ({
  pipeline: BROWSER_STEP_PIPELINE_ID,
  maxActions: ACTIONS_BOUND.target,
  elements: page.observation.elements.map((element) => ({
    ref: element.ref,
    kind: element.kind,
    ...(element.disabled ? { disabled: true } : {}),
    ...(element.visible ? {} : { visible: false }),
    ...(inScope(element, page.observation.activeScope) ? {} : { behind: true }),
    ...(element.options === null ? {} : { options: shownOptions(element).shown }),
    ...(shownOptions(element).more > 0 ? { optionsOmitted: shownOptions(element).more } : {}),
    ...(element.hiddenTraits.length > 0 ? { hiddenTraits: element.hiddenTraits } : {}),
    ...(marksOn(element, marks).length > 0
      ? { marks: marksOn(element, marks).map((mark) => mark.token) }
      : {}),
  })),
  pageShowsContent:
    page.observation.elements.length > 0 ||
    (page.observation.snapshotRung !== 'none' && page.observation.ariaSnapshot.trim() !== ''),
  ...(page.pageUnchanged && (page.lastStep?.touched.length ?? 0) > 0
    ? {
        pageUnchanged: true,
        lastRan: (page.lastStep?.touched ?? []).map((ran) => ({
          kind: ran.kind,
          ref: refNowOf(ran, page.observation.elements),
          detail: ran.detail,
        })),
      }
    : {}),
  ...(stops.length > 0 ? { stops: [...stops] } : {}),
});

/** The index this codec wrote, or null for a goal that is not a browser step. */
export const readStepIndex = (goal: string): StepIndex | null =>
  readFencedIndex(goal, stepIndexSchema);
