'use client';

import type { InterfaceProposal } from '@sysdesign/contracts';
import { Badge, Button, Stack, Text } from '@sysdesign/design-system';

export interface InterfaceProposalsProps {
  proposals: readonly InterfaceProposal[];
  asking: boolean;
  error: string | null;
  /** True when the last answer for THIS node came back empty. */
  askedAndEmpty: boolean;
  onAsk: () => void;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
}

/** What one proposal would add, as the row that offers it reads. */
function describe(proposal: InterfaceProposal): { kind: string; summary: string } {
  switch (proposal.kind) {
    case 'operation': {
      const { operation } = proposal;
      const grounding = operation.fulfills ? ` → ${operation.fulfills}` : '';
      const emits = operation.emits?.length ? ` emits ${operation.emits.join(', ')}` : '';
      return {
        kind: operation.kind,
        summary: `${operation.name}${operation.idempotent ? ' (idempotent)' : ''}${grounding}${emits}`,
      };
    }
    case 'config':
      return { kind: 'knob', summary: `${proposal.key} = ${String(proposal.value)}` };
    case 'responsibility':
      return { kind: 'responsibility', summary: proposal.text };
  }
}

/**
 * The request-and-answer surface for a component's interface: one button, the
 * proposals it came back with, each taken or dismissed on its own. Presentational
 * — the workspace owns the hook, the store owns the proposals.
 *
 * Deliberately absent, as in the brief's SuggestionsPanel: an "accept all".
 * Every item is a claim about what this component does, and one click that
 * adopts the model's whole reading of the design would make the grade measure
 * the model instead of the author. The friction is the feature.
 */
export function InterfaceProposals({
  proposals,
  asking,
  error,
  askedAndEmpty,
  onAsk,
  onAccept,
  onDismiss,
}: InterfaceProposalsProps) {
  return (
    <Stack gap={2} data-testid="interface-proposals">
      <Stack direction="row" gap={3} align="center" wrap>
        <div>
          <Button
            variant="subtle"
            size="sm"
            disabled={asking}
            onClick={onAsk}
            data-testid="suggest-interface"
          >
            {asking ? 'Asking…' : 'Suggest for this component'}
          </Button>
        </div>
        {proposals.length > 0 ? (
          <Text as="span" size="sm" tone="muted" data-testid="interface-proposals-pending">
            {proposals.length} suggestion{proposals.length === 1 ? '' : 's'} to accept or dismiss
          </Text>
        ) : null}
      </Stack>

      {proposals.map((proposal) => {
        const { kind, summary } = describe(proposal);
        return (
          <Stack
            key={proposal.id}
            gap={1}
            data-testid={`interface-proposal-${proposal.id}`}
            data-kind={proposal.kind}
          >
            <Stack direction="row" gap={2} align="center" wrap>
              <Badge tone="accent">{kind}</Badge>
              <Text as="span" size="sm">
                {summary}
              </Text>
            </Stack>
            <Text size="sm" tone="muted">
              {proposal.rationale}
            </Text>
            <Stack direction="row" gap={2}>
              <Button
                variant="subtle"
                size="sm"
                onClick={() => onAccept(proposal.id)}
                data-testid={`accept-interface-proposal-${proposal.id}`}
              >
                Accept
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDismiss(proposal.id)}>
                Dismiss
              </Button>
            </Stack>
          </Stack>
        );
      })}

      {/* An absent model is not an error; it is an empty answer, said plainly. */}
      {askedAndEmpty ? (
        <Text size="sm" tone="muted" data-testid="interface-proposals-empty">
          No suggestions came back. Either no model is configured, or it had nothing it could stand
          behind for this component — the interface is yours to declare.
        </Text>
      ) : null}

      {error !== null ? (
        <Text size="sm" tone="secondary" data-testid="interface-proposals-error">
          {error}
        </Text>
      ) : null}
    </Stack>
  );
}
