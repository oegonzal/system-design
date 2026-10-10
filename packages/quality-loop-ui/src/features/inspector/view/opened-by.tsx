import type { RunOpenerDto } from '@sysdesign/contracts';
import { Text } from '@sysdesign/design-system';

import { openerText } from '../model/openers';

/** Who opened a record, as both pickers' rows say it: a muted dash when nobody said. Presentational. */
export function OpenedBy({ openedBy }: { openedBy: RunOpenerDto | null }) {
  return (
    openerText(openedBy) ?? (
      <Text as="span" tone="muted" size="sm">
        —
      </Text>
    )
  );
}
