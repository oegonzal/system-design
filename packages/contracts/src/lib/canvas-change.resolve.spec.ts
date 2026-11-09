import { describe, expect, it } from 'vitest';

import type { CriterionRef } from './brief-validator';
import { applyCanvasChange } from './canvas-change';
import { bestSubmission, changeOf, idsOf, wholeChange } from './canvas-change-fixtures';
import { resolveChangeAddresses } from './canvas-change.resolve';
import { repairSubmission } from './submission-repair';

const criteria: CriterionRef[] = [{ id: 'c1' }, { id: 'c2' }];

describe('resolveChangeAddresses', () => {
  it('[QL-84] a positional id is the best’s element at that position, at every address: upsert ids, an edge’s ends, removals, a binding’s nodes, path and entities, a rationale’s node, a decision’s nodes, an entity’s owner, a relation’s ends — numbered as the best was, whatever the change removes', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        nodes: {
          upsert: [{ id: 'node.2', kind: 'service', label: 'Order service' }],
          remove: ['node.1'],
        },
        edges: {
          upsert: [{ id: 'edge.2', source: 'node.2', target: 'node.3', kind: 'async' }],
          remove: [],
        },
        entities: {
          upsert: [
            {
              id: 'entity.2',
              name: 'Line',
              ownerNodeId: 'node.3',
              fields: [],
              invariants: [],
              states: [],
            },
          ],
          remove: [],
        },
        relations: { replace: [{ from: 'entity.2', to: 'entity.1', kind: 'references' }] },
        bindings: {
          upsert: [
            {
              criterionId: 'c2',
              nodeIds: ['node.3'],
              path: ['edge.2'],
              entityIds: ['entity.1'],
              claim: 'kept',
            },
          ],
          remove: [],
        },
        rationales: {
          upsert: [{ nodeId: 'node.3', prose: 'Rewritten.' }],
          remove: ['node.2'],
        },
        decisions: {
          upsertAt: [{ at: 1, decision: { choice: 'One store', nodeIds: ['node.3'] } }],
          removeAt: [],
          append: [{ choice: 'Add a cache', nodeIds: ['node.2'] }],
        },
      }),
    );
    // n-1 (node.1) removed, n-2 (node.2) rewritten in place keeping its position, n-3 (node.3) as it was.
    expect(applied.graph.nodes).toEqual([
      { id: 'n-2', kind: 'service', label: 'Order service', position: { x: 200, y: 0 } },
      bestSubmission().graph.nodes[2],
    ]);
    // e-1 went with n-1; e-2 (edge.2) was rewritten whole between n-2 and n-3.
    expect(applied.graph.edges).toEqual([
      { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'async' },
    ]);
    expect(applied.model?.entities[1]).toEqual({
      id: 'line',
      name: 'Line',
      ownerNodeId: 'n-3',
      fields: [],
      invariants: [],
      states: [],
    });
    expect(applied.model?.relations).toEqual([{ from: 'line', to: 'order', kind: 'references' }]);
    expect(applied.brief?.bindings[1]).toEqual({
      criterionId: 'c2',
      nodeIds: ['n-3'],
      path: ['e-2'],
      entityIds: ['order'],
      claim: 'kept',
    });
    expect(applied.narrative?.componentRationales).toEqual([
      { nodeId: 'n-3', prose: 'Rewritten.' },
    ]);
    expect(applied.narrative?.decisions).toEqual([
      { choice: 'One store', nodeIds: ['n-3'] },
      { choice: 'Add a cache', nodeIds: ['n-2'] },
    ]);
    // Every resolved ref is a real id: the repair, which drops what names
    // nothing, keeps the binding exactly as resolved.
    expect(repairSubmission(applied, criteria).brief?.bindings[1]).toEqual(
      applied.brief?.bindings[1],
    );
  });

  it('[QL-84] removals address by position too, for edges and entities', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        edges: { upsert: [], remove: ['edge.1'] },
        entities: { upsert: [], remove: ['entity.2'] },
      }),
    );
    expect(idsOf(applied.graph.edges)).toEqual(['e-2']);
    expect(idsOf(applied.model?.entities ?? [])).toEqual(['order']);
  });

  it('[QL-84] a position the best does not have is an unknown id: ignored as a removal, a dangling edge the graph drops, a binding node the repair drops, and a new element when upserted', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        nodes: {
          upsert: [{ id: 'node.9', kind: 'cache', label: 'Past the end' }],
          remove: ['node.8'],
        },
        edges: {
          upsert: [{ id: 'ai-e', source: 'node.9', target: 'n-2', kind: 'sync' }],
          remove: ['edge.9'],
        },
        bindings: {
          upsert: [{ criterionId: 'c2', nodeIds: ['node.9'], claim: 'nowhere' }],
          remove: [],
        },
      }),
    );
    // The upserted node is new under the id as written — an unknown id is a
    // new element, never a refusal; the edge to it resolved nothing, and
    // `node.9` IS now a node, so it stands.
    expect(idsOf(applied.graph.nodes)).toEqual(['n-1', 'n-2', 'n-3', 'node.9']);
    expect(idsOf(applied.graph.edges)).toEqual(['e-1', 'e-2', 'ai-e']);
    expect(applied.brief?.bindings[1].nodeIds).toEqual(['node.9']);

    const dangling = applyCanvasChange(
      bestSubmission(),
      changeOf({
        edges: {
          upsert: [{ id: 'ai-e', source: 'node.9', target: 'n-2', kind: 'sync' }],
          remove: [],
        },
        bindings: {
          upsert: [{ criterionId: 'c2', nodeIds: ['node.9'], claim: 'nowhere' }],
          remove: [],
        },
      }),
    );
    expect(idsOf(dangling.graph.edges)).toEqual(['e-1', 'e-2']);
    expect(repairSubmission(dangling, criteria).brief?.bindings.map((b) => b.criterionId)).toEqual([
      'c1',
    ]);
  });

  it('[QL-84] a ref that is not positional is left as written, so a change set in the author’s ids resolves to itself', () => {
    expect(resolveChangeAddresses(bestSubmission(), wholeChange())).toEqual(wholeChange());
    expect(resolveChangeAddresses(bestSubmission(), changeOf({}))).toEqual(changeOf({}));
  });

  it('[QL-84] positions are the best’s, not the result’s: an element this change set adds has no position yet', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        nodes: { upsert: [{ id: 'ai-cache', kind: 'cache', label: 'Cache' }], remove: [] },
        edges: {
          upsert: [{ id: 'ai-e', source: 'n-2', target: 'node.4', kind: 'sync' }],
          remove: [],
        },
      }),
    );
    expect(idsOf(applied.graph.nodes)).toEqual(['n-1', 'n-2', 'n-3', 'ai-cache']);
    expect(idsOf(applied.graph.edges)).toEqual(['e-1', 'e-2']);
  });
});
