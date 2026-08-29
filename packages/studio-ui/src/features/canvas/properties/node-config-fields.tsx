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

/** Delivery guarantees — one vocabulary for queue, event-stream and pub-sub. */
const DELIVERY_OPTIONS = ['at-least-once', 'at-most-once', 'exactly-once'] as const;

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
      return (
        <>
          {numberRow(config, setKey, 'replicas', 'Replicas', { max: 99 })}
          {selectRow(config, setKey, 'engine', 'Engine', [
            'postgres',
            'mysql',
            'document',
            'wide-column',
          ])}
          {selectRow(config, setKey, 'sharding', 'Sharding', ['none', 'hash', 'range'])}
          {selectRow(config, setKey, 'consistency', 'Consistency', [
            'strong',
            'eventual',
            'quorum',
          ])}
          {textRow(config, setKey, 'region', 'Region')}
          {checkboxRow(config, setKey, 'multiRegion', 'Multi-region')}
          {checkboxRow(config, setKey, 'backups', 'Backups')}
        </>
      );
    case 'service':
      return (
        <>
          {numberRow(config, setKey, 'replicas', 'Replicas', { max: 99 })}
          {checkboxRow(config, setKey, 'autoscaling', 'Autoscaling')}
          {textRow(config, setKey, 'region', 'Region')}
          {checkboxRow(config, setKey, 'idempotent', 'Idempotent')}
        </>
      );
    case 'worker':
      return (
        <>
          {numberRow(config, setKey, 'replicas', 'Replicas', { max: 99 })}
          {numberRow(config, setKey, 'concurrency', 'Concurrency')}
          {checkboxRow(config, setKey, 'idempotent', 'Idempotent')}
        </>
      );
    case 'replica':
      return numberRow(config, setKey, 'lagToleranceMs', 'Lag tolerance (ms)');
    case 'cache':
      return (
        <>
          {selectRow(config, setKey, 'strategy', 'Strategy', [
            'cache-aside',
            'write-through',
            'write-back',
          ])}
          {numberRow(config, setKey, 'ttlSeconds', 'TTL (seconds)')}
          {selectRow(config, setKey, 'eviction', 'Eviction', ['lru', 'lfu', 'ttl-only'])}
          {checkboxRow(config, setKey, 'invalidation', 'Invalidation')}
        </>
      );
    case 'queue':
      return (
        <>
          {selectRow(config, setKey, 'delivery', 'Delivery', DELIVERY_OPTIONS)}
          {selectRow(config, setKey, 'ordering', 'Ordering', ['none', 'fifo', 'per-key'])}
          {checkboxRow(config, setKey, 'dlq', 'Dead-letter queue')}
          {numberRow(config, setKey, 'maxRetries', 'Max retries')}
        </>
      );
    case 'event-stream':
      return (
        <>
          {numberRow(config, setKey, 'partitions', 'Partitions')}
          {numberRow(config, setKey, 'retentionHours', 'Retention (hours)')}
          {selectRow(config, setKey, 'delivery', 'Delivery', DELIVERY_OPTIONS)}
        </>
      );
    case 'gateway':
      return (
        <>
          {checkboxRow(config, setKey, 'rateLimit', 'Rate limiting')}
          {selectRow(config, setKey, 'authMode', 'Auth mode', ['none', 'jwt', 'api-key'])}
          {checkboxRow(config, setKey, 'admissionControl', 'Admission control')}
        </>
      );
    case 'load-balancer':
      return (
        <>
          {checkboxRow(config, setKey, 'rateLimit', 'Rate limiting')}
          {selectRow(config, setKey, 'algorithm', 'Algorithm', [
            'round-robin',
            'least-connections',
            'ip-hash',
          ])}
        </>
      );
    case 'object-store':
      return checkboxRow(config, setKey, 'versioning', 'Versioning');
    case 'search-index':
      return numberRow(config, setKey, 'replicas', 'Replicas', { max: 99 });
    case 'external-api':
      return (
        <>
          {numberRow(config, setKey, 'timeoutMs', 'Timeout (ms)')}
          {numberRow(config, setKey, 'retries', 'Retries')}
          {checkboxRow(config, setKey, 'circuitBreaker', 'Circuit breaker')}
        </>
      );
    case 'scheduler':
      return textRow(config, setKey, 'schedule', 'Schedule');
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
    case 'pub-sub':
      return (
        <>
          {selectRow(config, setKey, 'delivery', 'Delivery', DELIVERY_OPTIONS)}
          {numberRow(config, setKey, 'fanout', 'Fan-out (subscribers)')}
        </>
      );
    case 'cdc-connector':
      return selectRow(config, setKey, 'mode', 'Mode', ['log-based', 'outbox']);
    case 'notification-service':
      return (
        <>
          {textRow(config, setKey, 'channels', 'Channels')}
          {checkboxRow(config, setKey, 'rateLimit', 'Rate limiting')}
        </>
      );
    case 'stream-processor':
      return (
        <>
          {numberRow(config, setKey, 'parallelism', 'Parallelism')}
          {checkboxRow(config, setKey, 'checkpointing', 'Checkpointing')}
        </>
      );
    case 'data-warehouse':
      return selectRow(config, setKey, 'loadMode', 'Load mode', ['batch', 'streaming']);
    case 'data-lake':
      return selectRow(config, setKey, 'format', 'Format', ['parquet', 'json', 'raw']);
    case 'ml-inference':
      return (
        <>
          {numberRow(config, setKey, 'replicas', 'Replicas', { max: 99 })}
          {checkboxRow(config, setKey, 'gpu', 'GPU')}
          {numberRow(config, setKey, 'timeoutMs', 'Timeout (ms)')}
          {checkboxRow(config, setKey, 'fallback', 'Fallback')}
        </>
      );
    case 'workflow-engine':
      return selectRow(config, setKey, 'mode', 'Mode', ['orchestration', 'choreography']);
    case 'distributed-lock':
      return numberRow(config, setKey, 'ttlSeconds', 'TTL (seconds)');
    case 'id-generator':
      return selectRow(config, setKey, 'strategy', 'Strategy', ['snowflake', 'uuid', 'ticket']);
    case 'config-service':
      return checkboxRow(config, setKey, 'dynamic', 'Dynamic updates');
    case 'auth-service':
      return (
        <>
          {selectRow(config, setKey, 'tokenType', 'Token type', ['jwt', 'opaque'])}
          {checkboxRow(config, setKey, 'mfa', 'MFA')}
        </>
      );
    case 'secrets-manager':
      return checkboxRow(config, setKey, 'rotation', 'Rotation');
    case 'waf':
      return selectRow(config, setKey, 'mode', 'Mode', ['block', 'monitor']);
    case 'monitoring':
      return checkboxRow(config, setKey, 'alerting', 'Alerting');
    case 'logging':
      return numberRow(config, setKey, 'retentionDays', 'Retention (days)');
    case 'tracing':
      return numberRow(config, setKey, 'sampling', 'Sampling (%)', { max: 100 });
    case 'payment-provider':
      return (
        <>
          {checkboxRow(config, setKey, 'idempotencyKeys', 'Idempotency keys')}
          {checkboxRow(config, setKey, 'webhooks', 'Webhooks')}
        </>
      );
    default:
      return null;
  }
}
