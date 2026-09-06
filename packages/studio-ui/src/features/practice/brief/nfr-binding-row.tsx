'use client';

import {
  BINDING_MAX_NODES,
  BINDING_NOTE_MAX_LENGTH,
  MECHANISM_CLAIMS,
  MECHANISM_GUIDE,
  MECHANISM_KINDS,
  judgeMechanism,
  type CanvasGraph,
  type MechanismClaim,
  type MechanismGraph,
  type NfrBinding,
  type NfrItem,
  type NodeKind,
} from '@sysdesign/contracts';
import {
  Badge,
  CheckboxField,
  SelectField,
  Stack,
  Surface,
  Text,
  TextField,
} from '@sysdesign/design-system';
import type { ReactNode } from 'react';

import { eligibleNodes } from '../../canvas/brief-draft';
import { MechanismVerdictChip } from './mechanism-verdict';

/** The kinds a claim may be bound to, as prose for the empty state. */
function kindHint(mechanism: MechanismClaim): string {
  const kinds: readonly NodeKind[] = MECHANISM_KINDS[mechanism];
  if (kinds.length === 1) return `a ${kinds[0]}`;
  return `a ${kinds.slice(0, -1).join(', a ')} or a ${kinds[kinds.length - 1]}`;
}

export interface NfrBindingRowProps {
  nfr: NfrItem;
  graph: CanvasGraph;
  /** Built once per graph by the parent — rebuilding it per row is O(rows × graph). */
  mechanismGraph: MechanismGraph;
  binding: NfrBinding | null;
  onSelectMechanism: (mechanism: MechanismClaim) => void;
  onToggleNode: (nodeId: string) => void;
  onNote: (note: string) => void;
  onClear: () => void;
  /**
   * A machine proposal for this requirement, rendered by the parent. Passed as
   * a slot rather than as data so the row stays presentational and knows
   * nothing about where proposals come from.
   */
  proposal?: ReactNode;
}

/**
 * One requirement, and the author's claim about which components hold it.
 *
 * The row is the whole argument of the brief in miniature: name a mechanism,
 * point at the components, and see immediately whether the diagram agrees. The
 * node list is filtered to the kinds that could carry the claim, because
 * binding a DLQ to a client is impossible rather than merely wrong — the API
 * refuses it, so the editor must never offer it.
 */
export function NfrBindingRow({
  nfr,
  graph,
  mechanismGraph,
  binding,
  onSelectMechanism,
  onToggleNode,
  onNote,
  onClear,
  proposal,
}: NfrBindingRowProps) {
  const candidates = binding ? eligibleNodes(graph, binding.mechanism) : [];
  const labelOf = (id: string) => graph.nodes.find((node) => node.id === id)?.label ?? id;
  const verdict = binding
    ? judgeMechanism(mechanismGraph, binding.mechanism, binding.nodeIds)
    : null;
  const atCap = (binding?.nodeIds.length ?? 0) >= BINDING_MAX_NODES;

  return (
    <Surface
      as="section"
      padding={4}
      role="group"
      aria-label={nfr.statement}
      data-testid={`binding-row-${nfr.id}`}
    >
      <Stack gap={3}>
        <Stack direction="row" gap={2} align="center" wrap>
          <Badge tone="accent">{nfr.kind}</Badge>
          <Text as="span" size="sm">
            {nfr.statement}
          </Text>
          {nfr.target ? (
            <Text as="span" size="sm" tone="muted">
              {nfr.target}
            </Text>
          ) : null}
        </Stack>

        <SelectField
          label="Held by"
          data-testid={`binding-mechanism-${nfr.id}`}
          value={binding?.mechanism ?? ''}
          onChange={(event) => {
            const value = event.target.value;
            if (value === '') onClear();
            else onSelectMechanism(value as MechanismClaim);
          }}
        >
          <option value="">Not yet bound</option>
          {MECHANISM_CLAIMS.map((claim) => (
            <option key={claim} value={claim}>
              {MECHANISM_GUIDE[claim].label}
            </option>
          ))}
        </SelectField>

        {/* Outside the ternary: the interesting case is a proposal for a
            requirement nothing is bound to yet. */}
        {proposal}

        {binding ? (
          <Stack gap={3}>
            {candidates.length > 0 ? (
              <Stack gap={2} role="group" aria-label={`Components holding ${nfr.statement}`}>
                {candidates.map((node) => {
                  const checked = binding.nodeIds.includes(node.id);
                  return (
                    <CheckboxField
                      key={node.id}
                      label={`${node.label} · ${node.kind}`}
                      data-testid={`binding-node-${nfr.id}-${node.id}`}
                      checked={checked}
                      disabled={!checked && atCap}
                      onChange={() => onToggleNode(node.id)}
                    />
                  );
                })}
              </Stack>
            ) : (
              // Not a validation error — the canvas simply has nothing of a kind
              // that could carry this yet, which is itself the feedback.
              <Text size="sm" tone="muted" data-testid={`binding-no-candidates-${nfr.id}`}>
                Nothing on the canvas can carry {MECHANISM_GUIDE[binding.mechanism].label} yet — it
                needs {kindHint(binding.mechanism)}.
              </Text>
            )}

            {verdict ? (
              <MechanismVerdictChip
                verdict={verdict}
                proof={MECHANISM_GUIDE[binding.mechanism].proof}
                unclaimedLabels={verdict.unclaimed.map(labelOf)}
              />
            ) : null}

            <TextField
              label="Why (optional, never graded)"
              data-testid={`binding-note-${nfr.id}`}
              value={binding.note ?? ''}
              maxLength={BINDING_NOTE_MAX_LENGTH}
              onChange={(event) => onNote(event.target.value)}
            />
          </Stack>
        ) : null}
      </Stack>
    </Surface>
  );
}
