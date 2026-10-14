import { compactMoney } from '@sysdesign/contracts';
import { Heading, Stack, Text } from '@sysdesign/design-system';

/** What a firm was obligated over one window, in the codes the page reads. */
export interface FirmHoldings {
  amount: number;
  /** ISO dates, inclusive. */
  from: string;
  to: string;
}

export interface FirmHeaderProps {
  uei: string;
  /** The firm's name, once its registration or an award of its own names it. */
  name: string | null;
  /** Null until read, and when the read did not answer. */
  holdings: FirmHoldings | null;
}

/**
 * Who the page is about: the firm's name over its UEI, and what it was
 * obligated in the codes read. A firm nothing names yet is headed by its
 * UEI, which is what the address identifies it by.
 */
export function FirmHeader({ uei, name, holdings }: FirmHeaderProps) {
  return (
    <Stack gap={1}>
      <Heading level={1}>{name ?? `Firm ${uei}`}</Heading>
      <Text tone="secondary" size="sm">
        {[
          ...(name === null ? [] : [`UEI ${uei}`]),
          ...(holdings === null
            ? []
            : [
                holdings.amount > 0
                  ? `${compactMoney(holdings.amount)} obligated to it in these codes, ${holdings.from} to ${holdings.to}`
                  : `Nothing obligated to it in these codes, ${holdings.from} to ${holdings.to}`,
              ]),
        ].join(' · ')}
      </Text>
    </Stack>
  );
}
