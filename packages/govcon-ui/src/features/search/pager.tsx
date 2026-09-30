import { Button, Stack, Text } from '@sysdesign/design-system';

export interface PagerProps {
  offset: number;
  limit: number;
  /** Rows over the filters, before paging. */
  total: number;
  onChange(offset: number): void;
  disabled?: boolean;
}

/** Previous and next over a fixed page size; says which rows of how many are shown. */
export function Pager({ offset, limit, total, onChange, disabled = false }: PagerProps) {
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  return (
    <Stack direction="row" gap={3} align="center" wrap>
      <Button
        size="sm"
        variant="subtle"
        disabled={disabled || offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        Previous
      </Button>
      <Text as="span" tone="secondary" size="sm">
        {first}–{last} of {total}
      </Text>
      <Button
        size="sm"
        variant="subtle"
        disabled={disabled || last >= total}
        onClick={() => onChange(offset + limit)}
      >
        Next
      </Button>
    </Stack>
  );
}
