import type { OrchestrationStepStatus } from '@sysdesign/contracts';
import type { BadgeTone } from '@sysdesign/design-system';

import type { ChangeKind } from '../model/changes';
import type { Provenance } from '../model/action';

/**
 * The inspector's own vocabularies → badge tone, as data.
 *
 * Every one of these is a closed list declared in the model, so a new member
 * fails to type-check here until it is given a tone — the same trick the
 * results view uses for the loop's verdicts, which it keeps rather than
 * repeats.
 *
 * Colour is never the only signal: every consumer renders the word beside the
 * tone, so a reader who cannot tell green from red loses nothing.
 */

export const CHANGE_TONE: Record<ChangeKind, BadgeTone> = {
  added: 'success',
  removed: 'critical',
  updated: 'accent',
  moved: 'medium',
};

/** A reconstructed entry makes no claim about when it happened; a recorded one does. */
export const PROVENANCE_TONE: Record<Provenance, BadgeTone> = {
  reconstructed: 'neutral',
  recorded: 'accent',
};

export const STEP_STATUS_TONE: Record<OrchestrationStepStatus, BadgeTone> = {
  pending: 'neutral',
  running: 'accent',
  complete: 'success',
  skipped: 'low',
  failed: 'critical',
};
