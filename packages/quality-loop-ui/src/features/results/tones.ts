import type {
  Decision,
  DecisionStep,
  EvidenceResult,
  LlmExchangeOutcome,
  QualityRunStatus,
} from '@sysdesign/contracts';
import type { BadgeTone } from '@sysdesign/design-system';

/** Vocabulary → badge tone, as data. Severity is itself a badge tone, so findings need no map. */

export const DECISION_TONE: Record<Decision, BadgeTone> = {
  accept: 'success',
  revise: 'medium',
  retry: 'high',
  escalate: 'critical',
  reject: 'critical',
};

export const RESULT_TONE: Record<EvidenceResult, BadgeTone> = {
  pass: 'success',
  partial: 'medium',
  fail: 'critical',
  not_applicable: 'neutral',
  unassessed: 'neutral',
};

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

export const STEP_TONE: Record<DecisionStep['outcome'], BadgeTone> = {
  computed: 'neutral',
  passed: 'success',
  decided: 'accent',
  skipped: 'neutral',
};

export const GATE_TONE: Record<'open' | 'closed', BadgeTone> = {
  open: 'success',
  closed: 'critical',
};
