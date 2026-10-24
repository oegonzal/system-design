import type {
  Target,
  TargetActivityKind,
  TargetContactRole,
  TargetKind,
  TargetLinkKind,
} from '@sysdesign/contracts';

import { awardHref, primeHref } from '../award-href';

/** What each kind of target is called, and what tracking one means — said once, for every panel and row. */
export const TARGET_KIND_LABEL: Record<TargetKind, string> = { firm: 'Firm', award: 'Award' };

export const TARGET_KIND_HINT: Record<TargetKind, string> = {
  firm: 'A firm to work with or under. Tracking it keeps your stage, contacts, links, what was done, what to do next, notes and a reminder; the daily warm says when an outreach has gone unanswered for the profile’s business days.',
  award:
    'An award whose work may be bought again. The daily warm reads a tracked award and tells you when it ends soon, when its end moves, when a stored notice may be its follow-on, and when an outreach about it has gone unanswered.',
};

/** Who a contact is, as the declared roles are shown. */
export const TARGET_CONTACT_ROLE_LABEL: Record<TargetContactRole, string> = {
  sblo: 'Small business liaison',
  'supplier-manager': 'Supplier manager',
  'program-manager': 'Program manager',
  'capture-manager': 'Capture manager',
  other: 'Other',
};

/** What a link opens, as the declared kinds are shown. */
export const TARGET_LINK_KIND_LABEL: Record<TargetLinkKind, string> = {
  website: 'Website',
  'supplier-portal': 'Supplier portal',
  'small-business-page': 'Small business page',
  directory: 'Directory',
  other: 'Other',
};

/** What was done, as the declared activity kinds are shown. */
export const TARGET_ACTIVITY_KIND_LABEL: Record<TargetActivityKind, string> = {
  registered: 'Registered',
  emailed: 'Emailed',
  called: 'Called',
  met: 'Met',
  replied: 'They replied',
};

/** The page each kind's subject opens at. */
const SUBJECT_HREF: Record<TargetKind, (subject: string) => string> = {
  firm: primeHref,
  award: awardHref,
};

export const targetHref = ({ kind, subject }: Pick<Target, 'kind' | 'subject'>): string =>
  SUBJECT_HREF[kind](subject);
