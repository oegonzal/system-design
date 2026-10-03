'use client';

import styled from '@emotion/styled';
import {
  NODE_OPERATIONS_BOUND,
  OPERATION_KINDS,
  OPERATION_NAME_MAX_LENGTH,
  OPERATION_NOTES_BOUND,
  type NodeOperation,
  type OperationKind,
} from '@sysdesign/contracts';
import {
  Button,
  CheckboxField,
  SelectField,
  Stack,
  Text,
  TextField,
} from '@sysdesign/design-system';

import { isDeclaredOperation } from '../graph-io';

export interface OperationsEditorProps {
  operations: NodeOperation[];
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

/** What a note is for, said under the field and there while it is typed: it is read with the design, not kept beside it. */
const NOTES_HINT = 'Read by the graders — e.g. retries, ordering, what it guarantees';

/** Severity ink on the surface: a caution, not a blocker. */
const DuplicateWarning = styled(Text)`
  color: ${({ theme }) => theme.color.severity.medium.fg};
`;

/**
 * Indexes of every operation sharing a name with another. Exact and
 * case-sensitive to mirror the API's referential validator; rows still being
 * typed are not declarations yet, so not duplicates either.
 */
function duplicateIndexes(operations: NodeOperation[]): Set<number> {
  const byName = new Map<string, number[]>();
  operations.forEach((operation, index) => {
    if (!isDeclaredOperation(operation)) return;
    byName.set(operation.name, [...(byName.get(operation.name) ?? []), index]);
  });
  const duplicates = new Set<number>();
  for (const indexes of byName.values()) {
    if (indexes.length > 1) indexes.forEach((index) => duplicates.add(index));
  }
  return duplicates;
}

/** The row with its verb set, or with the key removed when the author leaves it unstated. */
function withKind(operation: NodeOperation, value: string): NodeOperation {
  const next: NodeOperation = { ...operation };
  if (value.length > 0) next.kind = value as OperationKind;
  else delete next.kind;
  return next;
}

/**
 * The declared-interface list: one row per operation — name, verb,
 * idempotency, a note. Any kind may declare any operation; whether a queue
 * should serve a query is the architecture critic's call, not a form rule.
 * Purely controlled — every keystroke flows through `onChange`, so the canvas
 * store stays the source of truth.
 */
export function OperationsEditor({ operations, onChange }: OperationsEditorProps) {
  const duplicates = duplicateIndexes(operations);
  const atCap = operations.length >= NODE_OPERATIONS_BOUND.target;
  // A repeated name voids the whole submission at the API. Add is refused while
  // one stands, so a node cannot be filled up on top of an unresolved collision
  // the author would then have to scroll back to find. This does not make a
  // duplicate impossible — renaming a row is the only way to create one, and
  // that stays a per-row caution, because blocking a keystroke would fight the
  // typing.
  const canAdd = !atCap && duplicates.size === 0;

  const replaceRow = (index: number, next: NodeOperation) => {
    onChange(operations.map((operation, current) => (current === index ? next : operation)));
  };
  const patchRow = (index: number, patch: Partial<NodeOperation>) => {
    const operation = operations[index];
    if (operation) replaceRow(index, { ...operation, ...patch });
  };

  return (
    <Stack gap={3} data-testid="operations-editor">
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
              value={operation.kind ?? ''}
              onChange={(event) =>
                // "Not stated" deletes the key: the schema's kind is optional,
                // and an empty string is not one of its values.
                replaceRow(index, withKind(operation, event.target.value))
              }
            >
              <option value="">Not stated</option>
              {OPERATION_KINDS.map((kind) => (
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
            {/* A note is part of the design: the graders and the coach read it
                whole, so the field says so under itself — a hint, not a
                placeholder, so it stays while the note is typed — and counts
                down as its limit nears rather than stopping without a word. */}
            <TextField
              label="Notes"
              value={operation.notes ?? ''}
              maxLength={OPERATION_NOTES_BOUND.ceiling}
              target={OPERATION_NOTES_BOUND.target}
              hint={NOTES_HINT}
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
          disabled={!canAdd}
          onClick={() => onChange([...operations, { name: '', kind: OPERATION_KINDS[0] }])}
        >
          Add operation
        </Button>
        <Text as="span" size="sm" tone="muted">
          {operations.length} of {NODE_OPERATIONS_BOUND.target}
        </Text>
      </Stack>
    </Stack>
  );
}
