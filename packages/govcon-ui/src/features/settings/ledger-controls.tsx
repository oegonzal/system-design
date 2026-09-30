import { SOURCE_OPERATIONS, type SourceOperation } from '@sysdesign/contracts';
import { Button, SelectField, Stack, Text } from '@sysdesign/design-system';

export interface LedgerControlsProps {
  operation: SourceOperation | '';
  onOperationChange(next: SourceOperation | ''): void;
  total: number;
  limit: number;
  offset: number;
  onPage(offset: number): void;
  disabled?: boolean;
}

/** One operation or every one, and the page of the ledger to read. */
export function LedgerControls({
  operation,
  onOperationChange,
  total,
  limit,
  offset,
  onPage,
  disabled = false,
}: LedgerControlsProps) {
  const last = Math.min(total, offset + limit);
  return (
    <Stack direction="row" gap={4} align="end" wrap>
      <SelectField
        label="Operation"
        value={operation}
        disabled={disabled}
        onChange={(event) => onOperationChange(event.target.value as SourceOperation | '')}
      >
        <option value="">every operation</option>
        {SOURCE_OPERATIONS.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </SelectField>
      <Button
        type="button"
        variant="subtle"
        size="sm"
        disabled={disabled || offset === 0}
        onClick={() => onPage(Math.max(0, offset - limit))}
      >
        Newer
      </Button>
      <Button
        type="button"
        variant="subtle"
        size="sm"
        disabled={disabled || last >= total}
        onClick={() => onPage(offset + limit)}
      >
        Older
      </Button>
      <Text tone="secondary" size="sm">
        {total === 0 ? 'no calls' : `${offset + 1}–${last} of ${total}`}
      </Text>
    </Stack>
  );
}
