import type {
  AlertKind,
  AwardFamily,
  AwardSource,
  BidStage,
  LeadTier,
  SliceOutcome,
  SourceCallOutcome,
  SourceOperation,
  TargetKind,
  TargetStage,
} from '@sysdesign/contracts';
import type { BadgeTone, MeterTone } from '@sysdesign/design-system';

/** Vocabulary → tone, as data: every page colours a word the same way. */

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
  attachment: 'neutral',
  awards: 'medium',
  spending: 'medium',
  entity: 'high',
  exclusions: 'high',
  series: 'medium',
  breakdown: 'medium',
  horizon: 'medium',
  'agency-budget': 'neutral',
  'agency-offices': 'neutral',
  'agency-directory': 'neutral',
  freshness: 'neutral',
  'award-count': 'medium',
  'subaward-count': 'medium',
  subawards: 'medium',
  'award-detail': 'medium',
  'award-orders': 'medium',
  'award-subawards': 'medium',
};

export const TIER_TONE: Record<LeadTier, BadgeTone> = {
  high: 'success',
  medium: 'medium',
  low: 'neutral',
};

/** The score meter: usage of the scale is the good end here, so the tone follows the tier. */
export const SCORE_TONE: Record<LeadTier, MeterTone> = {
  high: 'success',
  medium: 'warn',
  low: 'danger',
};

export const AVAILABILITY_TONE: Record<'enabled' | 'disabled', BadgeTone> = {
  enabled: 'success',
  disabled: 'critical',
};

export const BID_STAGE_TONE: Record<BidStage, BadgeTone> = {
  watching: 'neutral',
  qualifying: 'accent',
  preparing: 'medium',
  submitted: 'high',
  won: 'success',
  lost: 'critical',
  passed: 'neutral',
};

/** A target's stage, of either kind: quiet while it is only known of, warmer as the pursuit moves, done when it lands. */
export const TARGET_STAGE_TONE: Record<TargetStage, BadgeTone> = {
  identified: 'neutral',
  contacted: 'accent',
  talking: 'medium',
  teamed: 'success',
  watching: 'neutral',
  researching: 'accent',
  positioning: 'medium',
  pursuing: 'high',
  passed: 'neutral',
};

export const TARGET_KIND_TONE: Record<TargetKind, BadgeTone> = { firm: 'accent', award: 'medium' };

export const ALERT_KIND_TONE: Record<AlertKind, BadgeTone> = {
  'award-ending': 'medium',
  'award-end-moved': 'high',
  'award-notice': 'success',
  'pulse-above-band': 'accent',
  'lead-new': 'success',
  'target-quiet': 'high',
};

export const AWARD_SOURCE_TONE: Record<AwardSource, BadgeTone> = {
  'sam.gov': 'accent',
  usaspending: 'neutral',
};

export const AWARD_FAMILY_TONE: Record<AwardFamily, BadgeTone> = {
  contracts: 'accent',
  idvs: 'neutral',
};

/** A registration's status as SAM.gov spells it — open vocabulary, priced by a default. */
export const registrationTone = (status: string | null): BadgeTone =>
  status === 'Active' ? 'success' : status === null ? 'neutral' : 'high';
