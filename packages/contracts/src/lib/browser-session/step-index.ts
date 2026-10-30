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
import { unitIdentitySchema } from '../units/identity';
import { TAKEN_CONTROL_MAX_LENGTH, type TakenOnPage } from '../units/mission-taken';
import type { UnitOnRecord } from '../units/record';
import { UNIT_FACET_NAME_MAX_LENGTH, UNIT_NOTE_BOUND, UNIT_STANCES } from '../units/vocab';
import { STEP_ACTION_KINDS } from './action-effects';
import { refNowOf, type RanAction } from './action-identity';
import { ELEMENT_KINDS } from './element-kind';
import { DOCUMENT_NAME_MAX_LENGTH } from './mission-documents';
import { MARK_TOKEN_MAX_LENGTH, marksOn, type Mark } from './mission-marks';
import { STOP_CAUSE_MAX_LENGTH, STOP_TOKEN_MAX_LENGTH, type StopOnPage } from './mission-stops';
import {
  ELEMENT_REF,
  inScope,
  OPTIONS_SHOWN,
  type ObservedElement,
  type PageObservation,
} from './observation.schema';
import { BROWSER_STEP_PIPELINE_ID } from './pipelines';
import { ACTIONS_BOUND, type StepAction } from './step-plan.schema';
import { HIDDEN_TRAITS } from './vocab';

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
        cause: bounded.id(STOP_CAUSE_MAX_LENGTH, { min: 1 }),
        token: bounded.id(STOP_TOKEN_MAX_LENGTH, { min: 1 }),
        shown: z.boolean(),
      }),
    )
    .default([]),
  /**
   * Every cause the mission's Stop conditions declare: a terminate names one of
   * them, or the limits validator cuts it. Written only when the mission
   * declares any.
   */
  causes: z.array(bounded.id(STOP_CAUSE_MAX_LENGTH, { min: 1 })).default([]),
  /**
   * The facts the mission's Unit identity declares, by name: a taskStart
   * carries exactly these, or the limits validator cuts it. Written only when
   * the mission declares any.
   */
  unitFacets: z.array(bounded.id(UNIT_FACET_NAME_MAX_LENGTH, { min: 1 })).default([]),
  /**
   * The documents the mission declares, by name: an upload names one of them,
   * or the limits validator cuts it. Written only when the mission declares
   * any.
   */
  documents: z.array(bounded.id(DOCUMENT_NAME_MAX_LENGTH, { min: 1 })).default([]),
  /**
   * The units an advisor put on record as forbidden, by identity: a taskStart
   * whose facets match one is cut, with the record's note said back. Written
   * only when there are any; the units merely to avoid are prose for the
   * planner and never a validator's fact.
   */
  unitsForbidden: z
    .array(z.strictObject({ identity: unitIdentitySchema, note: bounded.text(UNIT_NOTE_BOUND) }))
    .default([]),
  /**
   * The exceptions the mission declares for taking a unit on record (`## Taking
   * a unit on record`): each stance, the control it ties the exception to, and
   * whether this page lists it. A taskStart declaring `onRecordTaken` is cut
   * when the mission declares no exception, or when every stance it declares
   * is withheld by a control this page lists; which unit it takes is the
   * session's to check against the whole record. Written only when the
   * mission declares any.
   */
  onRecordTaken: z
    .array(
      z.strictObject({
        stance: z.enum(UNIT_STANCES),
        control: bounded.id(TAKEN_CONTROL_MAX_LENGTH, { min: 1 }).nullable(),
        shown: z.boolean(),
      }),
    )
    .default([]),
});
export type StepIndex = z.infer<typeof stepIndexSchema>;

/** What the goal declares about units beyond this session, for the index: the facet names, the forbidden identities, and the exceptions as this page bears on them. */
export interface UnitFacts {
  facets: readonly string[];
  forbidden: readonly UnitOnRecord[];
  taken: readonly TakenOnPage[];
}

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
  causes: readonly string[],
  units: UnitFacts,
  documents: readonly string[],
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
  ...(causes.length > 0 ? { causes: [...causes] } : {}),
  ...(units.facets.length > 0 ? { unitFacets: [...units.facets] } : {}),
  ...(documents.length > 0 ? { documents: [...documents] } : {}),
  ...(units.forbidden.length > 0
    ? {
        unitsForbidden: units.forbidden.map((unit) => ({
          identity: [...unit.identity],
          note: unit.note,
        })),
      }
    : {}),
  ...(units.taken.length > 0 ? { onRecordTaken: [...units.taken] } : {}),
});

/** The index this codec wrote, or null for a goal that is not a browser step. */
export const readStepIndex = (goal: string): StepIndex | null =>
  readFencedIndex(goal, stepIndexSchema);
