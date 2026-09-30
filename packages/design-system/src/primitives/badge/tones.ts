import type { Decision, EvidenceResult } from '@sysdesign/contracts';

import type { BadgeTone } from './badge';

/**
 * The quality loop's verdict vocabularies as badge tones — data, so a
 * decision chip reads the same colour in every app that shows one. Severity
 * is itself a badge tone, so finding chips need no map.
 */

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
