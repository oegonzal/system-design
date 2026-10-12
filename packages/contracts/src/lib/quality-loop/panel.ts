/**
 * The panel orchestrators' wire types. A panel step runs a pipeline several
 * times; a reconcile step reads every run through the engine's one view and
 * reports where they agree and where they do not. Two orchestrators compose
 * them: `calibration` lets each run produce its own artifact, `second-opinion`
 * holds one artifact fixed. The reconcile reports; it never judges. The report
 * is a declared shape, so the runner holds every reconcile to it.
 */
import { z } from 'zod';

export const CALIBRATION_ORCHESTRATOR_ID = 'calibration';
export const SECOND_OPINION_ORCHESTRATOR_ID = 'second-opinion';

/** Why a panel or reconcile step skipped or completed short — beyond the runner's own reasons. */
export const PANEL_STEP_REASONS = ['sample-failed', 'too-few-runs'] as const;

export const SECOND_OPINION_STEP_REASONS = [...PANEL_STEP_REASONS, 'no-artifact'] as const;

/** A panel step runs each of its pipelines this many times unless the request says otherwise. */
export const DEFAULT_PANEL_SAMPLES = 3;
/** Every sample is a whole run on the subscription client; the request may not ask for more than this. */
export const MAX_PANEL_SAMPLES = 5;

/**
 * What the reconciled runs had in common. `produced`: each run produced its
 * own artifact, so only what is keyed by policy — decisions, dimensions,
 * finding types — is comparable. `provided`: every run judged one provided
 * artifact, so finding keys (type and locations) are comparable too.
 */
const panelAlignmentSchema = z.enum(['produced', 'provided']);
export type PanelAlignment = z.infer<typeof panelAlignmentSchema>;

/** A number's spread over the runs that carried it; `n` says how many did. */
const spreadSchema = z.strictObject({
  n: z.number().int().nonnegative(),
  min: z.number(),
  max: z.number(),
  mean: z.number(),
  range: z.number(),
});
export type SpreadDto = z.infer<typeof spreadSchema>;

/** A finding some runs confirmed and others did not; `seenBy` indexes the runs in reconcile order. */
const contestedFindingSchema = z.strictObject({
  key: z.string(),
  type: z.string(),
  seenBy: z.array(z.number().int().nonnegative()),
});
export type ContestedFindingDto = z.infer<typeof contestedFindingSchema>;

const counts = z.record(z.string(), z.number());

/**
 * The reconcile step's report. Counts and spreads, never a verdict: a
 * threshold on any of these would be policy, and policy lives on a pipeline.
 */
export const panelReportSchema = z.strictObject({
  alignment: panelAlignmentSchema,
  runs: z.number().int().nonnegative(),
  /** Final decision → how many runs ended there. */
  decisions: counts,
  stopReasons: counts,
  /** Gate → how many runs it held in. */
  gates: counts,
  iterations: spreadSchema.nullable(),
  overall: spreadSchema.nullable(),
  /** Dimension → its spread over the runs that assessed it; null when none did. */
  dimensions: z.record(z.string(), spreadSchema.nullable()),
  /** Finding type → how many runs confirmed at least one finding of it. */
  findingTypes: counts,
  /** What every run agreed on. Finding keys only under `provided` alignment. */
  unanimous: z.strictObject({ findingTypes: z.array(z.string()), findings: z.array(z.string()) }),
  /** What only some runs saw — the signal worth reading. Finding keys only under `provided` alignment. */
  contested: z.strictObject({
    decision: z.boolean(),
    findingTypes: z.array(z.string()),
    findings: z.array(contestedFindingSchema),
  }),
});
export type PanelReportDto = z.infer<typeof panelReportSchema>;
