'use client';

import {
  isPlatformId,
  PLATFORM_IDS,
  platformCatalogue,
  type PlatformId,
} from '@sysdesign/contracts';
import { SelectField, Text } from '@sysdesign/design-system';

export interface PlatformFieldProps {
  value: PlatformId | null;
  onChange: (platform: PlatformId | null) => void;
  'data-testid'?: string;
}

const NEUTRAL = '';

/** What the choice means for the author, from the catalogue's own numbers. */
function blurb(value: PlatformId | null): string {
  if (value === null) return 'Generic roles only: the graders judge each block by its role.';
  const { label, services, categories } = platformCatalogue(value);
  return `${services.length} ${label} services on the palette across ${categories.length} categories; every block still carries its role, and the graders judge the design as an architect of ${label} would.`;
}

/**
 * The platform a prompt's design is drawn on, chosen from the contract's
 * declared catalogues — or none, for a design in roles alone. Read as a
 * declared id, never cast: a value the list does not hold is neutral.
 */
export function PlatformField({ value, onChange, 'data-testid': testId }: PlatformFieldProps) {
  const id = testId ?? 'compose-platform';
  return (
    <>
      <SelectField
        label="Platform"
        value={value ?? NEUTRAL}
        onChange={(event) => onChange(isPlatformId(event.target.value) ? event.target.value : null)}
        data-testid={id}
      >
        <option value={NEUTRAL}>Platform-neutral — roles only</option>
        {PLATFORM_IDS.map((platform) => (
          <option key={platform} value={platform}>
            {platformCatalogue(platform).label}
          </option>
        ))}
      </SelectField>
      <Text size="sm" tone="muted" data-testid={`${id}-blurb`}>
        {blurb(value)}
      </Text>
    </>
  );
}
