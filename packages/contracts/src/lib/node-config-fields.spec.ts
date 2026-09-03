import { describe, expect, it } from 'vitest';

import { NODE_KINDS } from './canvas';
import { validateGraphReferences } from './graph-validator';
import {
  allConfigKeys,
  canonicalConfig,
  canonicalizeGraphConfig,
  configFieldsFor,
  isConfigValueInDomain,
  NODE_CONFIG_FIELDS,
} from './node-config-fields';

describe('NODE_CONFIG_FIELDS', () => {
  it('[UX-13] decides the knobs of every node kind, even when the decision is none', () => {
    for (const kind of NODE_KINDS) {
      expect(Array.isArray(NODE_CONFIG_FIELDS[kind]), kind).toBe(true);
    }
    // Storage-only and passive kinds offer nothing; a database offers sharding.
    expect(configFieldsFor('vector-db')).toEqual([]);
    expect(configFieldsFor('database').map((field) => field.key)).toContain('sharding');
    expect(configFieldsFor('queue').map((field) => field.key)).not.toContain('sharding');
  });

  it('every select carries a closed, non-empty vocabulary and every number sane bounds', () => {
    for (const kind of NODE_KINDS) {
      for (const field of configFieldsFor(kind)) {
        if (field.input === 'select') expect(field.options?.length, field.key).toBeGreaterThan(1);
        if (field.input === 'number' && field.max !== undefined) {
          expect(field.max, field.key).toBeGreaterThan(field.min ?? 0);
        }
      }
    }
    expect(allConfigKeys().length).toBeGreaterThan(30);
  });

  it('judges a value by its field domain — type, then vocabulary or bounds', () => {
    const field = (key: string) => {
      const found = configFieldsFor('database').find((candidate) => candidate.key === key);
      if (!found) throw new Error(`database offers no ${key}`);
      return found;
    };
    expect(isConfigValueInDomain(field('sharding'), 'hash')).toBe(true);
    expect(isConfigValueInDomain(field('sharding'), 'galaxy')).toBe(false);
    expect(isConfigValueInDomain(field('sharding'), true)).toBe(false);
    expect(isConfigValueInDomain(field('replicas'), 3)).toBe(true);
    expect(isConfigValueInDomain(field('replicas'), 500)).toBe(false);
    expect(isConfigValueInDomain(field('replicas'), -1)).toBe(false);
    expect(isConfigValueInDomain(field('backups'), true)).toBe(true);
    expect(isConfigValueInDomain(field('backups'), 'yes')).toBe(false);
  });

  it('canonicalConfig keeps the vocabulary and names what it dropped', () => {
    const { config, dropped } = canonicalConfig('database', {
      replicas: 2,
      sharding: 'hash',
      gpu: true, // a knob no database offers
      consistency: 'sometimes', // a value outside the vocabulary
    });
    expect(config).toEqual({ replicas: 2, sharding: 'hash' });
    expect(dropped).toEqual(['gpu', 'consistency']);
  });

  it('canonicalizeGraphConfig returns the same graph when nothing is off-vocabulary', () => {
    const graph = {
      nodes: [{ id: 'n-1', kind: 'database' as const, label: 'DB', config: { replicas: 2 } }],
      edges: [],
    };
    expect(canonicalizeGraphConfig(graph)).toBe(graph);
    const stale = {
      nodes: [{ id: 'n-1', kind: 'database' as const, label: 'DB', config: { gpu: true } }],
      edges: [],
    };
    expect(canonicalizeGraphConfig(stale).nodes[0]?.config).toEqual({});
  });

  it('[UX-13] the graph validator refuses a knob the kind does not offer — a hand-crafted payload', () => {
    const problems = validateGraphReferences({
      nodes: [{ id: 'n-1', kind: 'queue', label: 'Q', config: { sharding: 'hash', dlq: true } }],
      edges: [],
    });
    expect(problems).toEqual(['node n-1 sets config sharding, which a queue does not offer']);
  });
});
