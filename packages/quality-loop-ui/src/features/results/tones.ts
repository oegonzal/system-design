import type { DecisionStep, LlmExchangeOutcome, QualityRunStatus } from '@sysdesign/contracts';
import type { BadgeTone } from '@sysdesign/design-system';

/**
 * This app's own vocabularies → badge tone, as data. The verdict maps every
 * app shares (`DECISION_TONE`, `RESULT_TONE`) live in the design system.
 */

export const STATUS_TONE: Record<QualityRunStatus, BadgeTone> = {
  running: 'accent',
  complete: 'success',
  failed: 'critical',
};

export const OUTCOME_TONE: Record<LlmExchangeOutcome, BadgeTone> = {
  ok: 'success',
  refusal: 'high',
  'schema-miss': 'medium',
  error: 'critical',
};

/**
 * `passed` is the engine's word for "this gate did not decide, carry on" — never
 * for "this is good". A score below the accept bar passes the accept gate on its
 * way to the reject floor, and colouring that green told the reader the opposite
 * of what happened. Only the step that actually decided is given accent.
 */
export const STEP_TONE: Record<DecisionStep['outcome'], BadgeTone> = {
  computed: 'neutral',
  passed: 'neutral',
  decided: 'accent',
  skipped: 'low',
};

export const GATE_TONE: Record<'open' | 'closed', BadgeTone> = {
  open: 'success',
  closed: 'critical',
};
