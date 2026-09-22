/**
 * The panel orchestrators' wire types. A panel step runs a pipeline several
 * times; a reconcile step reads every run through the engine's one view and
 * reports where they agree and where they do not. Two orchestrators compose
 * them: `calibration` lets each run produce its own artifact, `second-opinion`
 * holds one artifact fixed. The reconcile reports; it never judges.
 */
export const CALIBRATION_ORCHESTRATOR_ID = 'calibration';
export const SECOND_OPINION_ORCHESTRATOR_ID = 'second-opinion';

/** Why a panel or reconcile step skipped or completed short — beyond the runner's own reasons. */
export const PANEL_STEP_REASONS = ['sample-failed', 'too-few-runs'] as const;
export type PanelStepReason = (typeof PANEL_STEP_REASONS)[number];

export const SECOND_OPINION_STEP_REASONS = [...PANEL_STEP_REASONS, 'no-artifact'] as const;
export type SecondOpinionStepReason = (typeof SECOND_OPINION_STEP_REASONS)[number];

/**
 * What the reconciled runs had in common. `produced`: each run produced its
 * own artifact, so only what is keyed by policy — decisions, dimensions,
 * finding types — is comparable. `provided`: every run judged one provided
 * artifact, so finding keys (type and locations) are comparable too.
 */
export type PanelAlignment = 'produced' | 'provided';

/** A number's spread over the runs that carried it; `n` says how many did. */
export interface SpreadDto {
  n: number;
  min: number;
  max: number;
  mean: number;
  range: number;
}

/** A finding some runs confirmed and others did not; `seenBy` indexes the runs in reconcile order. */
export interface ContestedFindingDto {
  key: string;
  type: string;
  seenBy: number[];
}

/**
 * The reconcile step's report. Counts and spreads, never a verdict: a
 * threshold on any of these would be policy, and policy lives on a pipeline.
 */
export interface PanelReportDto {
  alignment: PanelAlignment;
  runs: number;
  /** Final decision → how many runs ended there. */
  decisions: Record<string, number>;
  stopReasons: Record<string, number>;
  /** Gate → how many runs it held in. */
  gates: Record<string, number>;
  iterations: SpreadDto | null;
  overall: SpreadDto | null;
  /** Dimension → its spread over the runs that assessed it; null when none did. */
  dimensions: Record<string, SpreadDto | null>;
  /** Finding type → how many runs confirmed at least one finding of it. */
  findingTypes: Record<string, number>;
  /** What every run agreed on. Finding keys only under `provided` alignment. */
  unanimous: { findingTypes: string[]; findings: string[] };
  /** What only some runs saw — the signal worth reading. Finding keys only under `provided` alignment. */
  contested: { decision: boolean; findingTypes: string[]; findings: ContestedFindingDto[] };
}
