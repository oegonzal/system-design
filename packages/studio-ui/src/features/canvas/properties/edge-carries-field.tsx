'use client';

import { EDGE_CARRIES_BOUND, type NodeOperation } from '@sysdesign/contracts';
import { Badge, CheckboxField, Stack, Text } from '@sysdesign/design-system';

import { ChipRemoveButton } from './chip-remove-button';

/** One end of the connection: what it is called and what it declares. */
export interface CarriesEndpoint {
  label: string;
  operations: NodeOperation[];
}

export interface EdgeCarriesFieldProps {
  carries: string[];
  source: CarriesEndpoint;
  target: CarriesEndpoint;
  onChange: (carries: string[]) => void;
}

interface Candidate {
  name: string;
  kind: string | null;
  owners: string[];
}

/**
 * Every operation either endpoint declares, by name. A name both ends declare
 * is one candidate owned by both — the API accepts a carry that either side
 * declares, and a checkbox per side would let the author tick it twice.
 */
function candidatesOf(source: CarriesEndpoint, target: CarriesEndpoint): Candidate[] {
  const byName = new Map<string, Candidate>();
  for (const endpoint of [source, target]) {
    for (const operation of endpoint.operations) {
      // Rows still being typed in the owner's editor have no referable name yet.
      if (operation.name.length === 0) continue;
      const existing = byName.get(operation.name);
      if (existing) {
        existing.owners.push(endpoint.label);
        existing.kind ??= operation.kind ?? null;
      } else {
        byName.set(operation.name, {
          name: operation.name,
          kind: operation.kind ?? null,
          owners: [endpoint.label],
        });
      }
    }
  }
  return [...byName.values()];
}

/**
 * Which declared operations this connection exercises — offered, never typed.
 * The API refuses a carry neither endpoint declares, so the field offers only
 * declarations and shows a carry that outlived its declaration (the owner
 * renamed or deleted it) as a stale chip the author can only remove.
 */
export function EdgeCarriesField({ carries, source, target, onChange }: EdgeCarriesFieldProps) {
  const candidates = candidatesOf(source, target);
  const declared = new Set(candidates.map((candidate) => candidate.name));
  const stale = carries.filter((name) => !declared.has(name));
  const atCap = carries.length >= EDGE_CARRIES_BOUND.target;

  const toggle = (name: string, checked: boolean) => {
    if (checked) {
      if (carries.includes(name) || atCap) return;
      onChange([...carries, name]);
    } else {
      onChange(carries.filter((carry) => carry !== name));
    }
  };

  return (
    <Stack gap={3} role="group" aria-label="Carried operations" data-testid="edge-carries-field">
      <Text as="span" size="sm" tone="secondary">
        Carries
      </Text>

      {candidates.map((candidate) => {
        const checked = carries.includes(candidate.name);
        return (
          <CheckboxField
            key={candidate.name}
            label={[candidate.name, candidate.kind, candidate.owners.join(', ')]
              .filter((part) => part !== null)
              .join(' · ')}
            checked={checked}
            disabled={!checked && atCap}
            onChange={(event) => toggle(candidate.name, event.target.checked)}
          />
        );
      })}
      {candidates.length === 0 ? (
        <Text size="sm" tone="muted">
          Neither {source.label} nor {target.label} declares an operation yet — add one on the
          component that serves it.
        </Text>
      ) : null}

      {stale.map((name) => (
        <Stack key={name} direction="row" gap={2} align="center" wrap>
          <Badge tone="medium" data-testid={`carry-stale-${name}`}>
            {name}
            <ChipRemoveButton
              aria-label={`Remove carry ${name}`}
              onClick={() => onChange(carries.filter((carry) => carry !== name))}
            />
          </Badge>
          <Text as="span" size="sm" tone="muted">
            no longer declared on either end
          </Text>
        </Stack>
      ))}

      <Text as="span" size="sm" tone="muted">
        {carries.length} of {EDGE_CARRIES_BOUND.target}
      </Text>
    </Stack>
  );
}
