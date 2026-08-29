'use client';

import type { NodeConfig, NodeKind } from '@sysdesign/contracts';

import { CheckboxField, SelectField, TextField } from '../../../components/fields';

export interface NodeConfigFieldsProps {
  kind: NodeKind;
  config: NodeConfig;
  onChange: (config: NodeConfig) => void;
}

/**
 * Kind-specific knobs. The keys written here (`replicas`, `dlq`, `rateLimit`,
 * `strategy`, `ttlSeconds`, …) are the canonical config vocabulary: the
 * deterministic eval rules read them verbatim, so a key renamed here silently
 * un-grades a rule. `responsibilities`, `operations` and `carries` are
 * reserved for annotation features and must never appear as config keys.
 */

type SetKey = (key: string, value: string | number | boolean) => void;

/*
 * Row helpers — one per control shape, so each `case` below reads as a knob
 * list rather than four re-typed event handlers. Plain functions returning
 * elements of stable component types (not locally-declared components), so
 * React never remounts an input mid-keystroke.
 */

function numberRow(
  config: NodeConfig,
  setKey: SetKey,
  key: string,
  label: string,
  bounds: { min?: number; max?: number } = {},
) {
  return (
    <TextField
      label={label}
      type="number"
      min={bounds.min ?? 0}
      {...(bounds.max !== undefined ? { max: bounds.max } : {})}
      value={typeof config[key] === 'number' ? (config[key] as number) : ''}
      onChange={(event) => {
        const parsed = Number(event.target.value);
        if (!Number.isNaN(parsed)) setKey(key, parsed);
      }}
    />
  );
}

function textRow(config: NodeConfig, setKey: SetKey, key: string, label: string) {
  return (
    <TextField
      label={label}
      value={typeof config[key] === 'string' ? (config[key] as string) : ''}
      onChange={(event) => setKey(key, event.target.value)}
    />
  );
}

function selectRow(
  config: NodeConfig,
  setKey: SetKey,
  key: string,
  label: string,
  options: readonly string[],
) {
  return (
    <SelectField
      label={label}
      value={typeof config[key] === 'string' ? (config[key] as string) : options[0]}
      onChange={(event) => setKey(key, event.target.value)}
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </SelectField>
  );
}

function checkboxRow(config: NodeConfig, setKey: SetKey, key: string, label: string) {
  return (
    <CheckboxField
      label={label}
      checked={config[key] === true}
      onChange={(event) => setKey(key, event.target.checked)}
    />
  );
}

export function NodeConfigFields({ kind, config, onChange }: NodeConfigFieldsProps) {
  const setKey: SetKey = (key, value) => onChange({ ...config, [key]: value });

  switch (kind) {
    case 'database':
    case 'service':
      return numberRow(config, setKey, 'replicas', 'Replicas', { max: 99 });
    case 'cache':
      return (
        <>
          {selectRow(config, setKey, 'strategy', 'Strategy', ['cache-aside', 'write-through'])}
          {numberRow(config, setKey, 'ttlSeconds', 'TTL (seconds)')}
        </>
      );
    case 'queue':
      return checkboxRow(config, setKey, 'dlq', 'Dead-letter queue');
    case 'gateway':
    case 'load-balancer':
      return checkboxRow(config, setKey, 'rateLimit', 'Rate limiting');
    case 'websocket-gateway':
      return (
        <>
          {numberRow(config, setKey, 'maxConnections', 'Max connections')}
          {checkboxRow(config, setKey, 'sticky', 'Sticky sessions')}
        </>
      );
    case 'service-mesh':
      return checkboxRow(config, setKey, 'mtls', 'mTLS');
    case 'serverless-function':
      return (
        <>
          {numberRow(config, setKey, 'memoryMb', 'Memory (MB)')}
          {numberRow(config, setKey, 'timeoutSeconds', 'Timeout (seconds)')}
          {numberRow(config, setKey, 'provisionedConcurrency', 'Provisioned concurrency')}
        </>
      );
    case 'batch-job':
      return (
        <>
          {textRow(config, setKey, 'schedule', 'Schedule')}
          {checkboxRow(config, setKey, 'idempotent', 'Idempotent')}
        </>
      );
    case 'kv-store':
      return (
        <>
          {numberRow(config, setKey, 'replicas', 'Replicas', { max: 99 })}
          {selectRow(config, setKey, 'consistency', 'Consistency', [
            'strong',
            'eventual',
            'quorum',
          ])}
          {numberRow(config, setKey, 'ttlSeconds', 'TTL (seconds)')}
        </>
      );
    case 'time-series-db':
      return (
        <>
          {numberRow(config, setKey, 'retentionDays', 'Retention (days)')}
          {checkboxRow(config, setKey, 'downsampling', 'Downsampling')}
        </>
      );
    case 'vector-db':
      return (
        <>
          {numberRow(config, setKey, 'dimensions', 'Dimensions')}
          {textRow(config, setKey, 'indexType', 'Index type')}
        </>
      );
    default:
      return null;
  }
}
