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
 * `strategy`, `ttlSeconds`) are exactly the ones the deterministic eval rules
 * read — this form is the UI half of that contract.
 */
export function NodeConfigFields({ kind, config, onChange }: NodeConfigFieldsProps) {
  const setKey = (key: string, value: string | number | boolean) =>
    onChange({ ...config, [key]: value });

  switch (kind) {
    case 'database':
    case 'service':
      return (
        <TextField
          label="Replicas"
          type="number"
          min={0}
          max={99}
          value={typeof config['replicas'] === 'number' ? config['replicas'] : ''}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (!Number.isNaN(parsed)) setKey('replicas', parsed);
          }}
        />
      );
    case 'cache':
      return (
        <>
          <SelectField
            label="Strategy"
            value={typeof config['strategy'] === 'string' ? config['strategy'] : 'cache-aside'}
            onChange={(event) => setKey('strategy', event.target.value)}
          >
            <option value="cache-aside">cache-aside</option>
            <option value="write-through">write-through</option>
          </SelectField>
          <TextField
            label="TTL (seconds)"
            type="number"
            min={0}
            value={typeof config['ttlSeconds'] === 'number' ? config['ttlSeconds'] : ''}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (!Number.isNaN(parsed)) setKey('ttlSeconds', parsed);
            }}
          />
        </>
      );
    case 'queue':
      return (
        <CheckboxField
          label="Dead-letter queue"
          checked={config['dlq'] === true}
          onChange={(event) => setKey('dlq', event.target.checked)}
        />
      );
    case 'gateway':
    case 'load-balancer':
      return (
        <CheckboxField
          label="Rate limiting"
          checked={config['rateLimit'] === true}
          onChange={(event) => setKey('rateLimit', event.target.checked)}
        />
      );
    default:
      return null;
  }
}
