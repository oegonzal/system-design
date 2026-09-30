import type { SuccessCriterion } from '@sysdesign/contracts';

import { humanizeToken } from '../evaluation/humanize';

/**
 * The kinds the canvas pipeline derives, in the order a reader expects them:
 * what the system must do, how well, at what size, under what rules. A kind
 * outside this list — another pipeline's, a future one's — is still shown,
 * after these, in the order it first appears. Criterion kinds are an open
 * vocabulary on the pipeline and the studio never branches on one.
 */
export const KNOWN_CRITERION_KINDS: readonly string[] = [
  'functional',
  'non_functional',
  'scale',
  'constraint',
];

export interface CriterionGroup {
  kind: string;
  criteria: SuccessCriterion[];
}

export function groupCriteriaByKind(criteria: readonly SuccessCriterion[]): CriterionGroup[] {
  const order = [
    ...KNOWN_CRITERION_KINDS,
    ...criteria
      .map((criterion) => criterion.kind)
      .filter((kind) => !KNOWN_CRITERION_KINDS.includes(kind)),
  ];
  const groups: CriterionGroup[] = [];
  for (const kind of order) {
    if (groups.some((group) => group.kind === kind)) continue;
    const members = criteria.filter((criterion) => criterion.kind === kind);
    if (members.length > 0) groups.push({ kind, criteria: members });
  }
  return groups;
}

/** `non_functional` → "Non functional" — the token as a heading. */
export function humanizeKind(kind: string): string {
  return humanizeToken(kind);
}
