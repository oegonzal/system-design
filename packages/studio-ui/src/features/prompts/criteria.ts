import {
  CANVAS_CRITERION_KINDS,
  canvasCriterionKindLabel,
  type SuccessCriterion,
} from '@sysdesign/contracts';

import { humanizeToken } from '../evaluation/humanize';

/**
 * The kinds the canvas pipeline derives come first, in the contract's own
 * order — what the system must do, how well, at what size, under what rules.
 * A kind outside it — another pipeline's, a future one's — is still shown,
 * after these, in the order it first appears. Criterion kinds are an open
 * vocabulary on the pipeline and the studio never branches on one.
 */
const KNOWN_KINDS: readonly string[] = CANVAS_CRITERION_KINDS;

export interface CriterionGroup {
  kind: string;
  criteria: SuccessCriterion[];
}

export function groupCriteriaByKind(criteria: readonly SuccessCriterion[]): CriterionGroup[] {
  const order = [
    ...KNOWN_KINDS,
    ...criteria.map((criterion) => criterion.kind).filter((kind) => !KNOWN_KINDS.includes(kind)),
  ];
  const groups: CriterionGroup[] = [];
  for (const kind of order) {
    if (groups.some((group) => group.kind === kind)) continue;
    const members = criteria.filter((criterion) => criterion.kind === kind);
    if (members.length > 0) groups.push({ kind, criteria: members });
  }
  return groups;
}

/**
 * A kind as a heading: the contract's own label for a canvas kind
 * (`non_functional` → "Non-functional"), the token's words for any other.
 */
export function humanizeKind(kind: string): string {
  return canvasCriterionKindLabel(kind) ?? humanizeToken(kind);
}
