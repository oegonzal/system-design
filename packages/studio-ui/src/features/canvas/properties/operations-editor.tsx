'use client';

import styled from '@emotion/styled';
import {
  NODE_MAX_OPERATIONS,
  OPERATION_NAME_MAX_LENGTH,
  OPERATION_NOTES_MAX_LENGTH,
  type NodeOperation,
  type OperationKind,
} from '@sysdesign/contracts';
import { Button, Heading, Stack, Text } from '@sysdesign/design-system';

import { CheckboxField, SelectField, TextField } from '../../../components/fields';

export interface OperationsEditorProps {
  operations: NodeOperation[];
  /** The kinds this node's capability row allows — the select offers nothing else. */
  allowedKinds: readonly OperationKind[];
  /** "Operations" for api-role kinds, "Message types" for channels. */
  heading: string;
  onChange: (operations: NodeOperation[]) => void;
}

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]}px;
  padding: ${({ theme }) => theme.space[3]}px;
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.md};
`;

/** Severity ink on the surface: a caution, not a blocker. */
const DuplicateWarning = styled(Text)`
  color: ${({ theme }) => theme.color.severity.medium.fg};
`;

/**
 * Indexes of every operation sharing a name with another. Exact and
 * case-sensitive to mirror the API's referential validator; empty names are
 * rows still being typed, not duplicates.
 */
function duplicateIndexes(operations: NodeOperation[]): Set<number> {
  const byName = new Map<string, number[]>();
  operations.forEach((operation, index) => {
    if (operation.name.length === 0) return;
    byName.set(operation.name, [...(byName.get(operation.name) ?? []), index]);
  });
  const duplicates = new Set<number>();
  for (const indexes of byName.values()) {
    if (indexes.length > 1) indexes.forEach((index) => duplicates.add(index));
  }
  return duplicates;
}

/**
 * The declared-interface list: one row per operation (endpoint or message
 * type, depending on the node's role). Purely controlled — every keystroke
 * flows through `onChange`, so the canvas store stays the source of truth.
 */
export function OperationsEditor({
  operations,
  allowedKinds,
  heading,
  onChange,
}: OperationsEditorProps) {
  if (allowedKinds.length === 0) return null;

  const duplicates = duplicateIndexes(operations);
  const atCap = operations.length >= NODE_MAX_OPERATIONS;

  const patchRow = (index: number, patch: Partial<NodeOperation>) => {
    onChange(
      operations.map((operation, current) =>
        current === index ? { ...operation, ...patch } : operation,
      ),
    );
  };

  return (
    <Stack gap={3} data-testid="operations-editor">
      <Heading level={4}>{heading}</Heading>

      {operations.map((operation, index) => {
        // Screen readers and tests name a row by what it declares; a row
        // still being typed falls back to its 1-based position.
        const displayName = operation.name.length > 0 ? operation.name : String(index + 1);
        return (
          <Row
            // eslint-disable-next-line @eslint-react/no-array-index-key -- rows have no id; order is stable between edits
            key={index}
            role="group"
            aria-label={`Operation ${displayName}`}
            data-testid={`operation-row-${index}`}
          >
            <TextField
              label="Name"
              value={operation.name}
              maxLength={OPERATION_NAME_MAX_LENGTH}
              onChange={(event) => patchRow(index, { name: event.target.value })}
            />
            <SelectField
              label="Kind"
              value={operation.kind}
              onChange={(event) => patchRow(index, { kind: event.target.value as OperationKind })}
            >
              {allowedKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </SelectField>
            <CheckboxField
              label="Idempotent"
              checked={operation.idempotent === true}
              onChange={(event) => patchRow(index, { idempotent: event.target.checked })}
            />
            <TextField
              label="Notes"
              value={operation.notes ?? ''}
              maxLength={OPERATION_NOTES_MAX_LENGTH}
              onChange={(event) => patchRow(index, { notes: event.target.value })}
            />
            {duplicates.has(index) ? (
              // UI guard for the API's 422: the save would be rejected anyway,
              // so say it here, next to the offending name.
              <DuplicateWarning size="sm" data-testid={`operation-duplicate-${index}`}>
                Duplicate name — each operation must be unique on this component.
              </DuplicateWarning>
            ) : null}
            <Button
              variant="ghost"
              aria-label={`Remove operation ${displayName}`}
              onClick={() => onChange(operations.filter((_, current) => current !== index))}
            >
              Remove
            </Button>
          </Row>
        );
      })}

      <Stack direction="row" align="center" justify="between">
        <Button
          disabled={atCap}
          onClick={() => onChange([...operations, { name: '', kind: allowedKinds[0] }])}
        >
          Add operation
        </Button>
        <Text as="span" size="sm" tone="muted">
          {operations.length} of {NODE_MAX_OPERATIONS}
        </Text>
      </Stack>
    </Stack>
  );
}
