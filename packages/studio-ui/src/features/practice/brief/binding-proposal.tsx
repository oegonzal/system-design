'use client';

import styled from '@emotion/styled';
import {
  MECHANISM_GUIDE,
  judgeMechanism,
  type BriefBindingProposal,
  type CanvasGraph,
  type MechanismGraph,
  type NfrBinding,
} from '@sysdesign/contracts';
import { Badge, Button, Stack, Text } from '@sysdesign/design-system';

import { MechanismVerdictChip } from './mechanism-verdict';

/**
 * Dashed and tinted: the visual grammar this codebase already uses for a
 * machine proposal that is not yet real, matching the ghost overlay and the
 * suggestion controls beside a finding.
 */
const Root = styled.div`
  border: 1px dashed ${({ theme }) => theme.color.border.accent};
  background: ${({ theme }) => theme.color.bg.selected};
  border-radius: ${({ theme }) => theme.radius.md};
  padding: ${({ theme }) => theme.space[3]}px;
`;

export interface BindingProposalProps {
  proposal: BriefBindingProposal;
  graph: CanvasGraph;
  mechanismGraph: MechanismGraph;
  /** What accepting would overwrite, when the author already bound this one. */
  replaces: NfrBinding | null;
  onAccept: () => void;
  onDismiss: () => void;
}

/**
 * One proposal, beside the requirement it is about.
 *
 * It carries the SAME verdict chip the author's own bindings carry, run through
 * the same `judgeMechanism` the grade uses — so a suggestion the canvas cannot
 * back up looks exactly as weak here as it will score. That is the point: the
 * model is not an oracle, and accepting an uncorroborated claim costs marks.
 * Showing the verdict is what turns "take the machine's word" into a judgement
 * the author actually makes.
 */
export function BindingProposal({
  proposal,
  graph,
  mechanismGraph,
  replaces,
  onAccept,
  onDismiss,
}: BindingProposalProps) {
  const labelOf = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id;
  const verdict = judgeMechanism(mechanismGraph, proposal.mechanism, proposal.nodeIds);

  return (
    <Root
      role="group"
      aria-label={`Suggestion for ${proposal.nfrId}`}
      data-testid={`binding-proposal-${proposal.nfrId}`}
    >
      <Stack gap={3}>
        <Stack direction="row" gap={2} align="center" wrap>
          <Badge tone="neutral">ai</Badge>
          <Text as="span" size="sm">
            {MECHANISM_GUIDE[proposal.mechanism].label} on{' '}
            {proposal.nodeIds.map(labelOf).join(', ')}
          </Text>
        </Stack>

        <Text size="sm" tone="muted" data-testid={`proposal-rationale-${proposal.nfrId}`}>
          {proposal.rationale}
        </Text>

        <MechanismVerdictChip
          verdict={verdict}
          proof={MECHANISM_GUIDE[proposal.mechanism].proof}
          unclaimedLabels={verdict.unclaimed.map(labelOf)}
        />

        {/*
          Accepting is destructive when a binding is already there, and the
          author is owed that fact before they click rather than after.
        */}
        {replaces ? (
          <Text size="sm" tone="secondary" data-testid={`proposal-replaces-${proposal.nfrId}`}>
            Accepting replaces your {MECHANISM_GUIDE[replaces.mechanism].label} binding.
          </Text>
        ) : null}

        <Stack direction="row" gap={2} wrap>
          <div>
            <Button
              variant="solid"
              size="sm"
              onClick={onAccept}
              data-testid={`accept-proposal-${proposal.nfrId}`}
            >
              Accept
            </Button>
          </div>
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDismiss}
              data-testid={`dismiss-proposal-${proposal.nfrId}`}
            >
              Dismiss
            </Button>
          </div>
        </Stack>
      </Stack>
    </Root>
  );
}
