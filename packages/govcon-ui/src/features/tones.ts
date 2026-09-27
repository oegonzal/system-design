import type {
  LeadTier,
  SliceOutcome,
  SourceCallOutcome,
  SourceOperation,
} from '@sysdesign/contracts';
import type { BadgeTone } from '@sysdesign/design-system';

/** Vocabulary → badge tone, as data. */

export const SLICE_OUTCOME_TONE: Record<SliceOutcome, BadgeTone> = {
  ok: 'success',
  cached: 'neutral',
  'budget-exhausted': 'medium',
  error: 'critical',
  skipped: 'neutral',
};

export const CALL_OUTCOME_TONE: Record<SourceCallOutcome, BadgeTone> = {
  ok: 'success',
  error: 'critical',
  'rate-limited': 'high',
  'invalid-response': 'medium',
};

export const OPERATION_TONE: Record<SourceOperation, BadgeTone> = {
  search: 'accent',
  description: 'neutral',
};

export const TIER_TONE: Record<LeadTier, BadgeTone> = {
  high: 'success',
  medium: 'medium',
  low: 'neutral',
};

export const AVAILABILITY_TONE: Record<'enabled' | 'disabled', BadgeTone> = {
  enabled: 'success',
  disabled: 'critical',
};
