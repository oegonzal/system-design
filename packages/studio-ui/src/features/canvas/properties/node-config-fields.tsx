'use client';

import {
  configFieldsFor,
  type ConfigFieldSpec,
  type NodeConfig,
  type NodeKind,
} from '@sysdesign/contracts';

import { CheckboxField, SelectField, TextField } from '../../../components/fields';

export interface NodeConfigFieldsProps {
  kind: NodeKind;
  config: NodeConfig;
  onChange: (config: NodeConfig) => void;
}

/**
 * Kind-specific knobs, rendered from `NODE_CONFIG_FIELDS` in contracts — the
 * one declaration of the canonical config vocabulary the eval rules read
 * verbatim. This file owns nothing about WHICH knobs exist; it only maps each
 * field's control shape to an input. `responsibilities`, `operations` and
 * `carries` are annotation features and never appear as config keys.
 */

type SetKey = (key: string, value: string | number | boolean) => void;

/*
 * Row helpers — one per control shape. Plain functions returning elements of
 * stable component types (not locally-declared components), so React never
 * remounts an input mid-keystroke.
 */

function numberRow(config: NodeConfig, setKey: SetKey, field: ConfigFieldSpec) {
  return (
    <TextField
      key={field.key}
      label={field.label}
      type="number"
      min={field.min ?? 0}
      {...(field.max !== undefined ? { max: field.max } : {})}
      value={typeof config[field.key] === 'number' ? (config[field.key] as number) : ''}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        if (!Number.isNaN(parsed)) setKey(field.key, parsed);
      }}
    />
  );
}

function textRow(config: NodeConfig, setKey: SetKey, field: ConfigFieldSpec) {
  return (
    <TextField
      key={field.key}
      label={field.label}
      value={typeof config[field.key] === 'string' ? (config[field.key] as string) : ''}
      onChange={(event) => setKey(field.key, event.target.value)}
    />
  );
}

function selectRow(config: NodeConfig, setKey: SetKey, field: ConfigFieldSpec) {
  const options = field.options ?? [];
  return (
    <SelectField
      key={field.key}
      label={field.label}
      value={typeof config[field.key] === 'string' ? (config[field.key] as string) : options[0]}
      onChange={(event) => setKey(field.key, event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </SelectField>
  );
}

function checkboxRow(config: NodeConfig, setKey: SetKey, field: ConfigFieldSpec) {
  return (
    <CheckboxField
      key={field.key}
      label={field.label}
      checked={config[field.key] === true}
      onChange={(event) => setKey(field.key, event.target.checked)}
    />
  );
}

const ROW_BY_INPUT = {
  number: numberRow,
  text: textRow,
  select: selectRow,
  checkbox: checkboxRow,
} satisfies Record<ConfigFieldSpec['input'], typeof numberRow>;

export function NodeConfigFields({ kind, config, onChange }: NodeConfigFieldsProps) {
  const fields = configFieldsFor(kind);
  if (fields.length === 0) return null;
  const setKey: SetKey = (key, value) => onChange({ ...config, [key]: value });
  return <>{fields.map((field) => ROW_BY_INPUT[field.input](config, setKey, field))}</>;
}
