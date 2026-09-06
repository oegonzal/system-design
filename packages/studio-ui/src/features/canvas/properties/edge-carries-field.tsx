'use client';

import {
  EDGE_MAX_CARRIES,
  OPERATION_NAME_MAX_LENGTH,
  type NodeOperation,
} from '@sysdesign/contracts';
import { Badge, CheckboxField, Stack, Text, TextField } from '@sysdesign/design-system';
import { useState } from 'react';

import { ChipRemoveButton } from './chip-remove-button';

export interface EdgeCarriesFieldProps {
  carries: string[];
  /** The interface owner's label — names whose declarations a carry resolves against. */
  ownerLabel: string;
  /** The owner's declared operations; each becomes a checkbox. */
  declaredOps: NodeOperation[];
  onChange: (carries: string[]) => void;
}

/**
 * Which of the owner's declared operations this connection exercises. A carry
 * naming an operation the owner never declared is deliberately allowed — the
 * eval grades the gap — but it is flagged inline so the author sees the
 * contract drift as they type it.
 */
export function EdgeCarriesField({
  carries,
  ownerLabel,
  declaredOps,
  onChange,
}: EdgeCarriesFieldProps) {
  const [draft, setDraft] = useState('');
  const atCap = carries.length >= EDGE_MAX_CARRIES;

  // Rows still being typed in the owner's editor have no referable name yet.
  const declared = declaredOps.filter((operation) => operation.name.length > 0);
  const declaredNames = new Set(declared.map((operation) => operation.name));
  const undeclared = carries.filter((name) => !declaredNames.has(name));

  const toggle = (name: string, checked: boolean) => {
    if (checked) {
      if (carries.includes(name) || atCap) return;
      onChange([...carries, name]);
    } else {
      onChange(carries.filter((carry) => carry !== name));
    }
  };

  const commitDraft = () => {
    const value = draft.trim();
    if (value.length === 0) return;
    if (carries.includes(value)) {
      setDraft('');
      return;
    }
    if (atCap) return;
    onChange([...carries, value]);
    setDraft('');
  };

  return (
    <Stack gap={3} role="group" aria-label="Carried operations" data-testid="edge-carries-field">
      <Text as="span" size="sm" tone="secondary">
        Carries
      </Text>

      {declared.map((operation, index) => {
        const checked = carries.includes(operation.name);
        return (
          <CheckboxField
            // eslint-disable-next-line @eslint-react/no-array-index-key -- names can transiently collide while the owner is edited
            key={`${index}-${operation.name}`}
            label={`${operation.name} · ${operation.kind}`}
            checked={checked}
            disabled={!checked && atCap}
            onChange={(event) => toggle(operation.name, event.target.checked)}
          />
        );
      })}
      {declared.length === 0 ? (
        <Text size="sm" tone="muted">
          No operations declared on {ownerLabel} yet.
        </Text>
      ) : null}

      {undeclared.map((name) => (
        <Stack key={name} direction="row" gap={2} align="center" wrap>
          <Badge tone="medium">
            {name}
            <ChipRemoveButton
              aria-label={`Remove carry ${name}`}
              onClick={() => onChange(carries.filter((carry) => carry !== name))}
            />
          </Badge>
          <Text as="span" size="sm" tone="muted">
            not declared on {ownerLabel}
          </Text>
        </Stack>
      ))}

      <TextField
        label="Carry an undeclared operation"
        value={draft}
        maxLength={OPERATION_NAME_MAX_LENGTH}
        disabled={atCap}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          commitDraft();
        }}
      />
      <Text size="sm" tone="muted">
        Undeclared carries are allowed — the evaluation grades them.
      </Text>
    </Stack>
  );
}
