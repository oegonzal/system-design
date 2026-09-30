'use client';

import styled from '@emotion/styled';
import {
  NODE_CONFIG_KEY_MAX_LENGTH,
  NODE_CONFIG_MAX_KEYS,
  NODE_CONFIG_STRING_VALUE_MAX_LENGTH,
  type NodeConfigEntry,
} from '@sysdesign/contracts';
import { Badge, Button, Stack, Text, TextField } from '@sysdesign/design-system';
import { useState } from 'react';

import { ChipRemoveButton } from './chip-remove-button';
import {
  configValueType,
  formatConfigValue,
  normalizeConfigKey,
  parseConfigValue,
} from './config-value';

export interface ConfigEditorProps {
  config: NodeConfigEntry[];
  onChange: (config: NodeConfigEntry[]) => void;
}

const Row = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
  padding: ${({ theme }) => `${theme.space[1]}px 0`};
  list-style: none;
  font-size: ${({ theme }) => theme.font.size.sm};
  color: ${({ theme }) => theme.color.text.primary};
`;

const Key = styled.span`
  font-family: ${({ theme }) => theme.font.family.mono};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

const Value = styled.span`
  font-family: ${({ theme }) => theme.font.family.mono};
  overflow-wrap: anywhere;
`;

/** Severity ink on the surface: a caution, not a blocker. */
const Problem = styled(Text)`
  color: ${({ theme }) => theme.color.severity.medium.fg};
`;

/**
 * Free-form typed configuration: one row per key, typed by what the author
 * wrote (`3` is a number, `true` a flag, anything else text) and shown with
 * its type so the lenses and the author read the same value. Nothing here
 * knows which keys matter — the quality loop judges whatever was declared.
 * Purely controlled; only the half-typed draft row is local state.
 */
export function ConfigEditor({ config, onChange }: ConfigEditorProps) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const atCap = config.length >= NODE_CONFIG_MAX_KEYS;

  const normalizedKey = normalizeConfigKey(key);
  const duplicate = config.some((entry) => entry.key === normalizedKey);
  const error =
    key.length > 0 && normalizedKey.length === 0
      ? 'A key cannot be blank.'
      : duplicate
        ? `${normalizedKey} is already set — remove it first to change its value.`
        : null;
  const canAdd = normalizedKey.length > 0 && !duplicate && !atCap;

  const add = () => {
    if (!canAdd) return;
    onChange([...config, { key: normalizedKey, value: parseConfigValue(value) }]);
    setKey('');
    setValue('');
  };

  return (
    <Stack gap={3} data-testid="config-editor">
      {config.length > 0 ? (
        <Stack as="ul" gap={0}>
          {config.map((entry) => (
            <Row key={entry.key} data-testid={`config-row-${entry.key}`}>
              <Key>{entry.key}</Key>
              <Value>{formatConfigValue(entry.value)}</Value>
              <Badge tone="neutral" data-testid={`config-type-${entry.key}`}>
                {configValueType(entry.value)}
                <ChipRemoveButton
                  aria-label={`Remove config ${entry.key}`}
                  onClick={() =>
                    onChange(config.filter((candidate) => candidate.key !== entry.key))
                  }
                />
              </Badge>
            </Row>
          ))}
        </Stack>
      ) : (
        <Text size="sm" tone="muted">
          Nothing configured yet.
        </Text>
      )}

      <Stack direction="row" gap={2} align="end" wrap>
        <TextField
          label="Key"
          data-testid="config-key"
          value={key}
          maxLength={NODE_CONFIG_KEY_MAX_LENGTH}
          disabled={atCap}
          placeholder="e.g. replicas"
          onChange={(event) => setKey(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
        <TextField
          label="Value"
          data-testid="config-value"
          value={value}
          maxLength={NODE_CONFIG_STRING_VALUE_MAX_LENGTH}
          disabled={atCap}
          placeholder="3, true, or text"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
        />
        <Button variant="subtle" onClick={add} disabled={!canAdd} data-testid="config-add">
          Add
        </Button>
      </Stack>

      {error !== null ? (
        <Problem size="sm" data-testid="config-error">
          {error}
        </Problem>
      ) : null}
      <Text as="span" size="sm" tone="muted">
        {config.length} of {NODE_CONFIG_MAX_KEYS} · numbers and true/false are typed as such,
        anything else is text.
      </Text>
    </Stack>
  );
}
