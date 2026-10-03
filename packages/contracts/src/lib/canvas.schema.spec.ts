import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CANVAS_NODES_BOUND, CANVAS_MAX_TOTAL_OPERATIONS, NODE_CONFIG_KEYS_BOUND } from './canvas';
import { designSubmissionSchema, type DesignSubmission } from './canvas.schema';
import { boundsAgainstMeasured } from './measured-bounds';
import measured from './measured/canvas.json';

/** A complete, valid submission: every optional field present once. */
export function submissionFixture(): DesignSubmission {
  return {
    graph: {
      nodes: [
        { id: 'n-1', kind: 'client', label: 'Shopper', position: { x: 0, y: 0 } },
        {
          id: 'n-2',
          kind: 'service',
          label: 'Order API',
          config: [
            { key: 'replicas', value: 3 },
            { key: 'autoscaling', value: true },
            { key: 'region', value: 'eu-west-1' },
          ],
          responsibilities: ['owns the order lifecycle'],
          operations: [{ name: 'placeOrder', kind: 'command', idempotent: true, notes: 'keyed' }],
        },
        { id: 'n-3', kind: 'database', label: 'Orders DB' },
      ],
      edges: [
        { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync', carries: ['placeOrder'] },
        { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync', label: 'writes' },
      ],
    },
    brief: {
      version: 1,
      bindings: [
        {
          criterionId: 'c1',
          nodeIds: ['n-2', 'n-3'],
          path: ['e-1', 'e-2'],
          claim: 'the API writes the order',
        },
      ],
    },
    narrative: {
      version: 1,
      overview: 'One service in front of one store.',
      componentRationales: [{ nodeId: 'n-2', prose: 'Holds the order rules.' }],
      criterionNarrations: [
        { criterionId: 'c1', prose: 'The shopper places an order through the API.' },
      ],
    },
  };
}

describe('designSubmissionSchema', () => {
  it('[DEL-7] accepts a full submission and infers the same object back', () => {
    const fixture = submissionFixture();
    expect(designSubmissionSchema.parse(fixture)).toEqual(fixture);
  });

  it('accepts a bare diagram with no brief and no narrative', () => {
    const { graph } = submissionFixture();
    expect(designSubmissionSchema.safeParse({ graph, brief: null, narrative: null }).success).toBe(
      true,
    );
  });

  it('rejects an unknown node kind, an unknown key, and a nested config value', () => {
    const fixture = submissionFixture();
    const badKind = structuredClone(fixture);
    (badKind.graph.nodes[0] as { kind: string }).kind = 'mainframe';
    expect(designSubmissionSchema.safeParse(badKind).success).toBe(false);

    const extraKey = { ...structuredClone(fixture), archetype: 'x' };
    expect(designSubmissionSchema.safeParse(extraKey).success).toBe(false);

    const nested = structuredClone(fixture);
    (nested.graph.nodes[1].config as unknown[])[0] = { key: 'limits', value: { rps: 1 } };
    expect(designSubmissionSchema.safeParse(nested).success).toBe(false);
  });

  it('bounds every array at its ceiling, so an oversize submission is refused before any lens sees it', () => {
    const fixture = submissionFixture();
    const tooManyNodes = structuredClone(fixture);
    tooManyNodes.graph.nodes = Array.from({ length: CANVAS_NODES_BOUND.ceiling + 1 }, (_, i) => ({
      id: `n-${i}`,
      kind: 'service' as const,
      label: '',
    }));
    expect(designSubmissionSchema.safeParse(tooManyNodes).success).toBe(false);

    const tooManyKeys = structuredClone(fixture);
    tooManyKeys.graph.nodes[1].config = Array.from(
      { length: NODE_CONFIG_KEYS_BOUND.ceiling + 1 },
      (_, i) => ({
        key: `k${i}`,
        value: i,
      }),
    );
    expect(designSubmissionSchema.safeParse(tooManyKeys).success).toBe(false);
  });

  it('requires a binding to name a component and make a claim', () => {
    const fixture = submissionFixture();
    const noNodes = structuredClone(fixture);
    noNodes.brief!.bindings[0].nodeIds = [];
    expect(designSubmissionSchema.safeParse(noNodes).success).toBe(false);
    const noClaim = structuredClone(fixture);
    noClaim.brief!.bindings[0].claim = '';
    expect(designSubmissionSchema.safeParse(noClaim).success).toBe(false);
  });

  it('[QL-49] every bound the coach writes into sits above what it has measurably written', () => {
    // `measured/canvas.json`: every field the canvas coach wrote across the
    // recorded runs, refreshed by `pnpm measure:bounds`. A target under the
    // 99th percentile written would make most revisions overruns, and a
    // ceiling at or under the longest would keep it past the ceiling rather
    // than accept it — which a submit, held to the ceilings, then refuses.
    expect(measured.runs).toBeGreaterThan(0);
    expect(boundsAgainstMeasured(designSubmissionSchema, measured.fields)).toEqual([]);
  });

  it('converts to JSON Schema, so a model can be asked to write into it', () => {
    expect(() => z.toJSONSchema(designSubmissionSchema)).not.toThrow();
  });

  /**
   * A `.describe()` is the ONLY channel that reaches the coach: `z.toJSONSchema`
   * carries a description and silently drops a `.refine()`, and a TypeScript
   * comment reaches nobody. Every rule that voids a revision and cannot be
   * expressed as a bound must therefore be said here, or the writer is refused
   * for a rule it was never told.
   */
  it('tells the coach, in the JSON Schema itself, every rule that would void its revision', () => {
    const json = JSON.stringify(z.toJSONSchema(designSubmissionSchema));
    for (const rule of [
      `all nodes together declare at most ${CANVAS_MAX_TOTAL_OPERATIONS} operations`,
      'Every node id is distinct,',
      'Every edge id is distinct, and no edge joins a node to itself.',
      'One entry per key; a key set twice is refused.',
      'A name must be unique on the node',
      'each declared on its source or its target, and none repeated',
      // The rules that were already stated, kept here so one list is the record.
      "The author's id; keep it.",
      'One connected walk of existing edge ids',
      'At most one binding per criterion.',
    ]) {
      expect(json, `the coach is never told: ${rule}`).toContain(rule);
    }
  });
});
