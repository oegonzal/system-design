import type { Target, TargetKind } from '@sysdesign/contracts';

import { awardHref, primeHref } from '../award-href';

/** What each kind of target is called, and what tracking one means — said once, for every panel and row. */
export const TARGET_KIND_LABEL: Record<TargetKind, string> = { firm: 'Firm', award: 'Award' };

export const TARGET_KIND_HINT: Record<TargetKind, string> = {
  firm: 'A firm to work with or under. Tracking it keeps your stage, contact, notes and a reminder; nothing is read about it on a schedule.',
  award:
    'An award whose work may be bought again. The daily warm reads a tracked award and tells you when it ends soon, when its end moves, and when a stored notice may be its follow-on.',
};

/** The page each kind's subject opens at. */
const SUBJECT_HREF: Record<TargetKind, (subject: string) => string> = {
  firm: primeHref,
  award: awardHref,
};

export const targetHref = ({ kind, subject }: Pick<Target, 'kind' | 'subject'>): string =>
  SUBJECT_HREF[kind](subject);
