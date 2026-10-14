import type { Entity } from '@sysdesign/contracts';
import { Alert, Button, Stack, Text } from '@sysdesign/design-system';

import { EntityCard } from '../entities/entity-card';
import { lookupCost } from '../entities/lookup-cost';

export interface RegistrationPanelProps {
  uei: string;
  /** The registrant as stored; null until it has been looked up. */
  entity: Entity | null;
  onLookup(): void;
  /** While a lookup is in flight. */
  pending?: boolean;
  /** Why the lookup did not answer, or that SAM.gov knows no such registrant. */
  problem?: string | null;
}

/**
 * A firm's SAM.gov registration as the store holds it: registered until
 * when, small in which codes, excluded or not. Reading it costs nothing;
 * looking it up — the first time, or again — is one budgeted request, and
 * the button says so before it is pressed.
 */
export function RegistrationPanel({
  uei,
  entity,
  onLookup,
  pending = false,
  problem = null,
}: RegistrationPanelProps) {
  return (
    <Stack gap={3}>
      {entity === null ? (
        <Text tone="muted" size="sm">
          {`No registration is stored for ${uei}. Look it up to see whether it is registered, in which codes it is small, and whether it is excluded.`}
        </Text>
      ) : (
        <EntityCard entity={entity} headingLevel={2} />
      )}
      <Stack direction="row" gap={3} align="center" wrap>
        <Button type="button" variant="subtle" size="sm" disabled={pending} onClick={onLookup}>
          {pending
            ? 'Looking up…'
            : `${entity === null ? 'Look up' : 'Look up again'} — ${lookupCost(1)}`}
        </Button>
      </Stack>
      {problem ? <Alert tone="warn">{problem}</Alert> : null}
    </Stack>
  );
}
