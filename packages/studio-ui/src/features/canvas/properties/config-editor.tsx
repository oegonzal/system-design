'use client';

import styled from '@emotion/styled';
import {
  NODE_CONFIG_KEY_MAX_LENGTH,
  NODE_CONFIG_KEYS_BOUND,
  NODE_CONFIG_STRING_VALUE_BOUND,
  type NodeConfigEntry,
} from '@sysdesign/contracts';
import { Badge, Button, Stack, Text, TextField } from '@sysdesign/design-system';
import { useState, type KeyboardEvent } from 'react';

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

/**
 * The draft's Key and Value, side by side where the panel has the room and
 * each on its own line where it has not. Aligned at the top, so a message
 * one field shows under its input moves nothing beside it.
 */
const DraftFields = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[2]}px;
`;

/** The width a draft field asks for before the row shares out what is left. */
const DRAFT_FIELD_BASIS = '10rem';

/**
 * One draft field, sized by the row and never by what it says under its
 * input: every field grows from one basis by an equal share, so Key and
 * Value are always one width, and a count or a limit message wraps inside
 * the field instead of widening it.
 */
const DraftField = styled.div`
  flex: 1 1 ${DRAFT_FIELD_BASIS};
  min-width: 0;
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
  const atCap = config.length >= NODE_CONFIG_KEYS_BOUND.target;

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
  // Enter in either field adds the draft, as the button does.
  const addOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    add();
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

      <DraftFields>
        <DraftField>
          <TextField
            label="Key"
            data-testid="config-key"
            value={key}
            maxLength={NODE_CONFIG_KEY_MAX_LENGTH}
            disabled={atCap}
            placeholder="e.g. replicas"
            onChange={(event) => setKey(event.target.value)}
            onKeyDown={addOnEnter}
          />
        </DraftField>
        <DraftField>
          <TextField
            label="Value"
            data-testid="config-value"
            value={value}
            maxLength={NODE_CONFIG_STRING_VALUE_BOUND.ceiling}
            target={NODE_CONFIG_STRING_VALUE_BOUND.target}
            disabled={atCap}
            placeholder="3, true, or text"
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={addOnEnter}
          />
        </DraftField>
      </DraftFields>
      <Stack direction="row">
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
        {config.length} of {NODE_CONFIG_KEYS_BOUND.target} · numbers and true/false are typed as
        such, anything else is text.
      </Text>
    </Stack>
  );
}
