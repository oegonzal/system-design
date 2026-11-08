import { describe, expect, it } from 'vitest';

import { modelSchema, parseLenient, walkJsonSchema } from './bounds';
import type { CriterionRef } from './brief-validator';
import { applyCanvasChange } from './canvas-change';
import { canvasChangeSchema, type CanvasChange } from './canvas-change.schema';
import { designSubmissionSchema, type DesignSubmission } from './canvas.schema';
import { repairSubmission } from './submission-repair';

const criteria: CriterionRef[] = [{ id: 'c1' }, { id: 'c2' }];

/** The best revision a change set is applied to: every container present, every part written once. */
function best(): DesignSubmission {
  return {
    graph: {
      nodes: [
        { id: 'n-1', kind: 'client', label: 'Shopper', position: { x: 0, y: 0 } },
        { id: 'n-2', kind: 'service', label: 'Order API', position: { x: 200, y: 0 } },
        { id: 'n-3', kind: 'database', label: 'Orders DB', position: { x: 400, y: 0 } },
      ],
      edges: [
        { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
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
          claim: 'the API writes',
        },
        { criterionId: 'c2', nodeIds: ['n-3'], claim: 'the store keeps it' },
      ],
    },
    narrative: {
      version: 1,
      overview: 'One service in front of one store.',
      componentRationales: [
        { nodeId: 'n-2', prose: 'Holds the order rules.' },
        { nodeId: 'n-3', prose: 'The system of record.' },
      ],
      criterionNarrations: [{ criterionId: 'c1', prose: 'An order goes through the API.' }],
      decisions: [{ choice: 'One store', alternative: 'A store per service', cost: 'Coupling' }],
      assumptions: ['Orders fit one region.'],
    },
    model: {
      version: 1,
      entities: [
        { id: 'order', name: 'Order', ownerNodeId: 'n-3', fields: [], invariants: [], states: [] },
        { id: 'line', name: 'Order line', fields: [], invariants: [], states: [] },
      ],
      relations: [{ from: 'order', to: 'line', kind: 'contains' }],
    },
    transcript: {
      version: 1,
      turns: [{ role: 'interviewer', phase: 'opening', text: 'Walk me through it.' }],
      phases: [{ id: 'opening', startedAt: '2026-11-08T00:00:00.000Z', endedAt: null }],
    },
  };
}

/** A best with no brief, no narrative and no model at all — the containers a change may bring into being. */
const bare = (): DesignSubmission => ({ graph: best().graph, brief: null, narrative: null });

const change = (changes: CanvasChange['changes']): CanvasChange => ({ changes });

/** A change set naming every part once, as the coach might return it. */
function wholeChange(): CanvasChange {
  return change({
    nodes: { upsert: [{ id: 'ai-cache', kind: 'cache', label: 'Order cache' }], remove: ['n-1'] },
    edges: {
      upsert: [{ id: 'ai-e-1', source: 'n-2', target: 'ai-cache', kind: 'sync' }],
      remove: ['e-1'],
    },
    entities: {
      upsert: [
        { id: 'cart', name: 'Cart', fields: [{ name: 'items' }], invariants: [], states: [] },
      ],
      remove: ['line'],
    },
    relations: { replace: [{ from: 'cart', to: 'order', kind: 'references' }] },
    bindings: {
      upsert: [{ criterionId: 'c2', nodeIds: ['ai-cache'], claim: 'cached' }],
      remove: [],
    },
    rationales: { upsert: [{ nodeId: 'ai-cache', prose: 'Absorbs the reads.' }], remove: ['n-2'] },
    narrations: { upsert: [{ criterionId: 'c2', prose: 'Reads hit the cache.' }], remove: ['c1'] },
    decisions: { replace: [{ choice: 'Cache the reads', cost: 'Staleness' }] },
    assumptions: { replace: ['Reads outnumber writes.'] },
    overview: 'A cache in front of the store.',
  });
}

const ids = (items: readonly { id: string }[]): string[] => items.map((item) => item.id);

describe('canvasChangeSchema', () => {
  it('[QL-84] accepts a change set naming every part and infers the same object back', () => {
    const whole = wholeChange();
    expect(canvasChangeSchema.parse(whole)).toEqual(whole);
    expect(canvasChangeSchema.parse(change({}))).toEqual(change({}));
  });

  it('[QL-84] a whole submission does not parse as a change set and a change set does not parse as a submission, strictly or leniently', () => {
    // The loop's fake model answers with the first canned object that parses
    // leniently, unknown keys stripped: without the one required root key a
    // submission would read as an empty change.
    expect(canvasChangeSchema.safeParse(best()).success).toBe(false);
    expect(parseLenient(canvasChangeSchema, best()).ok).toBe(false);
    expect(designSubmissionSchema.safeParse(wholeChange()).success).toBe(false);
    expect(parseLenient(designSubmissionSchema, wholeChange()).ok).toBe(false);
  });

  it('[QL-84] converts to the strict JSON schema a structured-output endpoint takes: every object closed, every property required', () => {
    // The endpoint's two structural demands, as `strictSchemaFaults` in
    // `@sysdesign/llm` states them — a package contracts (scope:universal) may
    // not import; the engine runs that check at boot on this same schema.
    const faults: string[] = [];
    walkJsonSchema(modelSchema(canvasChangeSchema).json, '', (node, path) => {
      if (node['type'] !== 'object' && node['properties'] === undefined) return;
      const where = path === '' ? 'the root object' : path;
      if (node['additionalProperties'] !== false) faults.push(`${where}: open object`);
      const required = new Set((node['required'] as string[] | undefined) ?? []);
      for (const key of Object.keys((node['properties'] as object | undefined) ?? {})) {
        if (!required.has(key)) faults.push(`${where}: ${key} is optional`);
      }
    });
    expect(faults).toEqual([]);
  });
});

describe('applyCanvasChange', () => {
  it('[QL-84] a change naming nothing returns the best, equal by value', () => {
    expect(applyCanvasChange(best(), change({}))).toEqual(best());
    expect(applyCanvasChange(bare(), change({}))).toEqual(bare());
  });

  it('[QL-84] an upsert replaces a known id in place and appends a new one, so untouched positional ids keep their numbers', () => {
    const applied = applyCanvasChange(
      best(),
      change({
        nodes: {
          upsert: [
            { id: 'n-2', kind: 'service', label: 'Order service', position: { x: 1, y: 1 } },
            { id: 'ai-cache', kind: 'cache', label: 'Order cache' },
          ],
          remove: [],
        },
        edges: {
          upsert: [{ id: 'e-1', source: 'n-1', target: 'n-2', kind: 'async' }],
          remove: [],
        },
      }),
    );
    expect(ids(applied.graph.nodes)).toEqual(['n-1', 'n-2', 'n-3', 'ai-cache']);
    expect(applied.graph.nodes[1]).toEqual({
      id: 'n-2',
      kind: 'service',
      label: 'Order service',
      position: { x: 1, y: 1 },
    });
    expect(applied.graph.edges[0]).toEqual({
      id: 'e-1',
      source: 'n-1',
      target: 'n-2',
      kind: 'async',
    });
    expect(applied.graph.edges[1]).toEqual(best().graph.edges[1]);
  });

  it('[QL-84] a later upsert for the same key wins, and is appended once', () => {
    const applied = applyCanvasChange(
      best(),
      change({
        nodes: {
          upsert: [
            { id: 'ai-x', kind: 'cache', label: 'first' },
            { id: 'ai-x', kind: 'cache', label: 'second' },
          ],
          remove: [],
        },
      }),
    );
    expect(ids(applied.graph.nodes)).toEqual(['n-1', 'n-2', 'n-3', 'ai-x']);
    expect(applied.graph.nodes[3].label).toBe('second');
  });

  it('[QL-84] a node upsert without a position keeps the best’s for that id; one with a position takes it; a new node without one has none', () => {
    const applied = applyCanvasChange(
      best(),
      change({
        nodes: {
          upsert: [
            { id: 'n-3', kind: 'database', label: 'Orders store' },
            { id: 'n-2', kind: 'service', label: 'Order API', position: { x: 9, y: 9 } },
            { id: 'ai-cache', kind: 'cache', label: 'Order cache' },
          ],
          remove: [],
        },
      }),
    );
    expect(applied.graph.nodes[2].position).toEqual({ x: 400, y: 0 });
    expect(applied.graph.nodes[1].position).toEqual({ x: 9, y: 9 });
    expect('position' in applied.graph.nodes[3]).toBe(false);
  });

  it('[QL-84] removes by key, and a removal naming nothing on the canvas is a no-op', () => {
    const applied = applyCanvasChange(
      best(),
      change({
        nodes: { upsert: [], remove: ['n-9'] },
        edges: { upsert: [], remove: ['e-2', 'e-9'] },
        entities: { upsert: [], remove: ['nothing'] },
        bindings: { upsert: [], remove: ['c9'] },
      }),
    );
    expect(applied.graph.nodes).toEqual(best().graph.nodes);
    expect(ids(applied.graph.edges)).toEqual(['e-1']);
    expect(applied.model).toEqual(best().model);
    expect(applied.brief).toEqual(best().brief);
  });

  it('[QL-84] removing a node removes every edge touching it, including one this change set added', () => {
    const applied = applyCanvasChange(
      best(),
      change({
        nodes: { upsert: [], remove: ['n-3'] },
        edges: {
          upsert: [{ id: 'ai-e', source: 'n-2', target: 'n-3', kind: 'async' }],
          remove: [],
        },
      }),
    );
    expect(ids(applied.graph.nodes)).toEqual(['n-1', 'n-2']);
    expect(ids(applied.graph.edges)).toEqual(['e-1']);
  });

  it('[QL-84] a container appears only when the change touches it, with its version literal', () => {
    const binding = { criterionId: 'c1', nodeIds: ['n-2'], claim: 'bound' };
    const briefed = applyCanvasChange(
      bare(),
      change({ bindings: { upsert: [binding], remove: [] } }),
    );
    expect(briefed.brief).toEqual({ version: 1, bindings: [binding] });
    expect(briefed.narrative).toBeNull();
    expect('model' in briefed).toBe(false);

    const explained = applyCanvasChange(bare(), change({ overview: 'Now explained.' }));
    expect(explained.narrative).toEqual({
      version: 1,
      overview: 'Now explained.',
      componentRationales: [],
      criterionNarrations: [],
    });
    expect(explained.brief).toBeNull();

    const entity = { id: 'order', name: 'Order', fields: [], invariants: [], states: [] };
    const modelled = applyCanvasChange(
      bare(),
      change({ entities: { upsert: [entity], remove: [] } }),
    );
    expect(modelled.model).toEqual({ version: 1, entities: [entity], relations: [] });

    // A model the best carries as null stays null exactly when nothing touches it.
    const nulled = applyCanvasChange({ ...bare(), model: null }, change({ overview: 'x' }));
    expect(nulled.model).toBeNull();
  });

  it('[QL-84] a positional list is replaced whole when named, an empty list removing it, and left alone when not', () => {
    const decision = { choice: 'Cache the reads', cost: 'Staleness' };
    const replaced = applyCanvasChange(
      best(),
      change({
        decisions: { replace: [decision] },
        assumptions: { replace: [] },
        relations: { replace: [] },
      }),
    );
    expect(replaced.narrative?.decisions).toEqual([decision]);
    expect(replaced.narrative !== null && 'assumptions' in replaced.narrative).toBe(false);
    expect(replaced.model?.relations).toEqual([]);
    expect(replaced.model?.entities).toEqual(best().model?.entities);

    const untouched = applyCanvasChange(best(), change({ overview: 'Rewritten.' }));
    expect(untouched.narrative?.decisions).toEqual(best().narrative?.decisions);
    expect(untouched.narrative?.assumptions).toEqual(best().narrative?.assumptions);
  });

  it('[QL-84] the overview is set when named, cleared by an empty string, and kept when not named', () => {
    expect(applyCanvasChange(best(), change({ overview: 'Rewritten.' })).narrative?.overview).toBe(
      'Rewritten.',
    );
    const cleared = applyCanvasChange(best(), change({ overview: '' })).narrative;
    expect(cleared !== null && 'overview' in cleared).toBe(false);
    const kept = applyCanvasChange(best(), change({ assumptions: { replace: ['Kept.'] } }));
    expect(kept.narrative?.overview).toBe(best().narrative?.overview);
  });

  it('[QL-84] bindings and narrations are keyed by criterion, rationales by node: replaced in place, a later entry winning, removed by key', () => {
    const applied = applyCanvasChange(
      best(),
      change({
        bindings: {
          upsert: [
            { criterionId: 'c1', nodeIds: ['n-2'], claim: 'first' },
            { criterionId: 'c1', nodeIds: ['n-2'], claim: 'second' },
          ],
          remove: ['c2'],
        },
        rationales: {
          upsert: [{ nodeId: 'n-3', prose: 'Rewritten.' }],
          remove: ['n-2'],
        },
        narrations: {
          upsert: [{ criterionId: 'c2', prose: 'Added.' }],
          remove: ['c1'],
        },
      }),
    );
    expect(applied.brief?.bindings).toEqual([
      { criterionId: 'c1', nodeIds: ['n-2'], claim: 'second' },
    ]);
    expect(applied.narrative?.componentRationales).toEqual([
      { nodeId: 'n-3', prose: 'Rewritten.' },
    ]);
    expect(applied.narrative?.criterionNarrations).toEqual([
      { criterionId: 'c2', prose: 'Added.' },
    ]);
  });

  it('[QL-84] leaves what a removal left dangling for repairSubmission, which drops it as it drops the editor’s', () => {
    const applied = applyCanvasChange(
      best(),
      change({
        nodes: { upsert: [], remove: ['n-3'] },
        entities: { upsert: [], remove: ['line'] },
      }),
    );
    // Applied: the binding on n-3, the rationale for it and the relation to `line` are still there.
    expect(applied.brief?.bindings.map((binding) => binding.criterionId)).toEqual(['c1', 'c2']);
    expect(applied.narrative?.componentRationales.map((item) => item.nodeId)).toEqual([
      'n-2',
      'n-3',
    ]);
    expect(applied.model?.relations).toEqual(best().model?.relations);
    // Repaired: the path stops where e-2 was, the binding with no node left goes, so do the rest.
    const repaired = repairSubmission(applied, criteria);
    expect(repaired.brief?.bindings).toEqual([
      { criterionId: 'c1', nodeIds: ['n-2'], path: ['e-1'], claim: 'the API writes' },
    ]);
    expect(repaired.narrative?.componentRationales.map((item) => item.nodeId)).toEqual(['n-2']);
    expect(repaired.model?.relations).toEqual([]);
  });

  it('[QL-84] copies the transcript from the best, and carries none when the best has none', () => {
    expect(applyCanvasChange(best(), wholeChange()).transcript).toEqual(best().transcript);
    expect('transcript' in applyCanvasChange(bare(), wholeChange())).toBe(false);
  });

  it('[QL-84] the applied result is a submission, and apply then repairSubmission is idempotent on it', () => {
    const applied = applyCanvasChange(best(), wholeChange());
    expect(designSubmissionSchema.parse(applied)).toEqual(applied);
    expect(ids(applied.graph.nodes)).toEqual(['n-2', 'n-3', 'ai-cache']);
    expect(ids(applied.graph.edges)).toEqual(['e-2', 'ai-e-1']);
    const once = repairSubmission(applied, criteria);
    expect(repairSubmission(once, criteria)).toEqual(once);
  });
});
