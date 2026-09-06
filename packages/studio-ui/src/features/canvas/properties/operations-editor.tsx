'use client';

import styled from '@emotion/styled';
import {
  NODE_MAX_OPERATIONS,
  OPERATION_MAX_EMITS,
  OPERATION_NAME_MAX_LENGTH,
  OPERATION_NOTES_MAX_LENGTH,
  fulfillableItems,
  isApiLikeRole,
  type InterfaceRole,
  type NodeOperation,
  type OperationKind,
  type WorkflowSpec,
} from '@sysdesign/contracts';
import {
  Button,
  CheckboxField,
  Heading,
  SelectField,
  Stack,
  Text,
  TextField,
} from '@sysdesign/design-system';

export interface OperationsEditorProps {
  operations: NodeOperation[];
  /** The kinds this node's capability row allows — the select offers nothing else. */
  allowedKinds: readonly OperationKind[];
  /** "Operations" for api-role kinds, "Message types" for channels. */
  heading: string;
  onChange: (operations: NodeOperation[]) => void;
  /**
   * The prompt's business layer plus this node's interface role, when the
   * session's prompt carries a workflow spec. Absent (the default) the
   * workflow controls render nothing and every existing call site is
   * untouched. The select offers only ids the spec declares for this role
   * and the row's kind — an ineligible pick is unrepresentable here; a
   * hand-crafted payload is the API validator's business.
   */
  workflow?: { spec: WorkflowSpec; role: InterfaceRole } | null;
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
  workflow = null,
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

  /** What THIS row may claim, given its current kind. */
  const fulfillableFor = (operation: NodeOperation) =>
    workflow === null ? [] : fulfillableItems(workflow.spec, workflow.role, operation.kind);

  /**
   * A kind flip after a Fulfills pick, emissions left on an ineligible row,
   * or two rows claiming the same item. The first two are warned, never
   * cleared or blocked: silently deleting a claim is hostile, the API
   * accepts both shapes, and the evaluation grades them — this ink previews
   * the finding. The duplicate is warned because the API would 422 it, the
   * same posture as the duplicate-name warning below.
   */
  const workflowWarning = (operation: NodeOperation): string | null => {
    if (workflow === null) return null;
    if (
      operation.fulfills !== undefined &&
      operations.filter((sibling) => sibling.fulfills === operation.fulfills).length > 1
    ) {
      return 'Two rows on this component fulfil the same requirement — the save would be rejected. Keep one claim.';
    }
    if (
      operation.fulfills !== undefined &&
      !fulfillableFor(operation).some((item) => item.id === operation.fulfills)
    ) {
      return `This row's kind no longer matches the linked requirement (${operation.fulfills}) — the evaluation will grade the mismatch.`;
    }
    if (
      (operation.emits ?? []).length > 0 &&
      (operation.kind !== 'command' || !isApiLikeRole(workflow.role))
    ) {
      return 'Only commands on api or event-driven components produce events — untick these emissions or move them to the command that causes them.';
    }
    return null;
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
            {workflow !== null && fulfillableFor(operation).length > 0 ? (
              <SelectField
                label="Fulfills"
                data-testid={`operation-fulfills-${index}`}
                value={operation.fulfills ?? ''}
                onChange={(event) =>
                  // "Not linked" DELETES the claim: an empty string would
                  // parse at the DTO and then 422 as an unknown id.
                  patchRow(index, {
                    fulfills: event.target.value.length > 0 ? event.target.value : undefined,
                  })
                }
              >
                <option value="">Not linked</option>
                {fulfillableFor(operation).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </SelectField>
            ) : null}
            {workflow !== null && fulfillableFor(operation).length > 0 ? (
              <Text size="sm" tone="muted" data-testid={`fulfills-guide-${index}`}>
                Which item of the prompt&apos;s workflow this operation realizes — claimed by
                reference and corroborated by the connections that exercise it, never by name.
              </Text>
            ) : null}
            {workflow !== null
              ? (() => {
                  const emits = operation.emits ?? [];
                  const emitsAtCap = emits.length >= OPERATION_MAX_EMITS;
                  const mayEmit = isApiLikeRole(workflow.role) && operation.kind === 'command';
                  // Rendered for eligible rows, and ALSO whenever emissions
                  // already exist: a kind or role flip must never strand
                  // claims behind vanished checkboxes the author cannot
                  // untick (the API rejects ineligible emissions).
                  if (!mayEmit && emits.length === 0) return null;
                  const shown = mayEmit
                    ? workflow.spec.events
                    : workflow.spec.events.filter((event) => emits.includes(event.id));
                  return shown.length > 0 ? (
                    <Stack gap={2} role="group" aria-label={`Emits for ${displayName}`}>
                      <Text as="span" size="sm" tone="muted">
                        Emits ({emits.length} of {OPERATION_MAX_EMITS}) — the prompt&apos;s events
                        this command publishes when it runs; the producer half of each event&apos;s
                        story.
                      </Text>
                      {shown.map((event) => {
                        const checked = emits.includes(event.id);
                        return (
                          <CheckboxField
                            key={event.id}
                            label={event.statement}
                            data-testid={`operation-emit-${index}-${event.id}`}
                            checked={checked}
                            // Inert at the cap, the EdgeCarriesField pattern.
                            disabled={!checked && emitsAtCap}
                            onChange={(changeEvent) => {
                              const next = changeEvent.target.checked
                                ? [...emits, event.id]
                                : emits.filter((id) => id !== event.id);
                              patchRow(index, {
                                emits: next.length > 0 ? next : undefined,
                              });
                            }}
                          />
                        );
                      })}
                    </Stack>
                  ) : null;
                })()
              : null}
            {workflowWarning(operation) !== null ? (
              <DuplicateWarning size="sm" data-testid={`operation-workflow-warning-${index}`}>
                {workflowWarning(operation)}
              </DuplicateWarning>
            ) : null}
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
