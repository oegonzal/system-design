'use client';

import type { MechanismVerdict } from '@sysdesign/contracts';
import { Badge, Stack, Text } from '@sysdesign/design-system';

/**
 * What the engine will say about this claim, said now.
 *
 * The point of the brief is that a claim is checked against the canvas rather
 * than taken on trust, and an author only learns that if the check is visible
 * while they write. This runs the SAME `judgeMechanism` the grade runs, over
 * the same graph — there is no second implementation to drift.
 *
 * It reports, it never blocks. An uncorroborated binding is a legal thing to
 * submit and a finding worth receiving; hiding it behind a disabled button
 * would move the teaching out of the evaluation and into a form validator.
 */
export type VerdictTone = 'empty' | 'contradicted' | 'uncorroborated' | 'corroborated';

export function verdictTone(verdict: MechanismVerdict): VerdictTone {
  if (verdict.contradicted.length > 0) return 'contradicted';
  const claimed = verdict.corroborated.length + verdict.uncorroborated.length;
  if (claimed === 0) return 'empty';
  return verdict.corroborated.length > 0 ? 'corroborated' : 'uncorroborated';
}

const COPY: Record<VerdictTone, string> = {
  empty: 'No components named',
  // The engine's word, deliberately. An author reading "unbacked" here and
  // "uncorroborated" on the finding would think they were two different things.
  uncorroborated: 'Not corroborated',
  contradicted: 'Contradicted by the diagram',
  corroborated: 'Corroborated',
};

const TONE_TO_BADGE = {
  empty: 'neutral',
  uncorroborated: 'medium',
  contradicted: 'high',
  corroborated: 'success',
} as const;

export interface MechanismVerdictProps {
  verdict: MechanismVerdict;
  /** What the system looks for, from `MECHANISM_GUIDE`. */
  proof: string;
  /** Labels for the ids in `verdict.unclaimed`, for the nudge. */
  unclaimedLabels: string[];
}

export function MechanismVerdictChip({ verdict, proof, unclaimedLabels }: MechanismVerdictProps) {
  const tone = verdictTone(verdict);

  return (
    <Stack gap={2} data-testid="mechanism-verdict" data-tone={tone}>
      <Stack direction="row" gap={2} align="center" wrap>
        <Badge tone={TONE_TO_BADGE[tone]}>{COPY[tone]}</Badge>
        {verdict.contradicted.length > 0 ? (
          <Text as="span" size="sm" tone="muted">
            {verdict.contradicted.length} named component
            {verdict.contradicted.length === 1 ? ' is' : 's are'} configured to do the opposite
          </Text>
        ) : null}
      </Stack>

      {/*
        Why, not just what. Corroboration is deliberately not uniform — some
        claims are proved by a knob on the component, others by where it sits
        in the graph — so an uncorroborated chip with no explanation is a
        mystery rather than a lesson.
      */}
      {tone === 'uncorroborated' ? (
        <Text size="sm" tone="muted" data-testid="mechanism-proof">
          Corroborated when {proof}.
        </Text>
      ) : null}

      {/*
        The nudge toward a complete brief: the engine can see these already,
        and the author is taking no credit for them.
      */}
      {unclaimedLabels.length > 0 ? (
        <Text size="sm" tone="muted" data-testid="mechanism-unclaimed">
          Also does this, unnamed: {unclaimedLabels.join(', ')}
        </Text>
      ) : null}
    </Stack>
  );
}
