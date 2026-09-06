'use client';

import { NODE_MAX_RESPONSIBILITIES, RESPONSIBILITY_MAX_LENGTH } from '@sysdesign/contracts';
import { Badge, Stack, Text, TextField } from '@sysdesign/design-system';
import { useState } from 'react';

import { ChipRemoveButton } from './chip-remove-button';

export interface ResponsibilitiesEditorProps {
  responsibilities: string[];
  onChange: (responsibilities: string[]) => void;
}

/**
 * Short role statements as chips — "owns order lifecycle", one clause each.
 * The list itself is controlled by the store; only the half-typed draft is
 * local state, committed on Enter (trimmed, deduped, capped at the contract's
 * six).
 */
export function ResponsibilitiesEditor({
  responsibilities,
  onChange,
}: ResponsibilitiesEditorProps) {
  const [draft, setDraft] = useState('');
  const atCap = responsibilities.length >= NODE_MAX_RESPONSIBILITIES;

  const commit = () => {
    const value = draft.trim();
    if (value.length === 0) return;
    if (responsibilities.includes(value)) {
      // Already declared — clearing the draft says "noted" without a twin chip.
      setDraft('');
      return;
    }
    if (atCap) return;
    onChange([...responsibilities, value]);
    setDraft('');
  };

  return (
    <Stack gap={3} data-testid="responsibilities-editor">
      {responsibilities.length > 0 ? (
        <Stack direction="row" gap={2} wrap>
          {responsibilities.map((value) => (
            <Badge key={value} tone="neutral">
              {value}
              <ChipRemoveButton
                aria-label={`Remove responsibility ${value}`}
                onClick={() => onChange(responsibilities.filter((entry) => entry !== value))}
              />
            </Badge>
          ))}
        </Stack>
      ) : null}
      <TextField
        label="Add responsibility"
        value={draft}
        maxLength={RESPONSIBILITY_MAX_LENGTH}
        disabled={atCap}
        placeholder="e.g. owns the order lifecycle"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return;
          event.preventDefault();
          commit();
        }}
      />
      <Text size="sm" tone="muted">
        What is this component in charge of? Keep it to a few.
      </Text>
    </Stack>
  );
}
