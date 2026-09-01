import type { CanvasGraph, FlowBinding, NfrBinding } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import {
  eligibleNodes,
  flowIdFor,
  flowIsComplete,
  nextHops,
  reconcileBrief,
  walkNodes,
} from './brief-draft';

/** client → gateway → service → database, plus a stray cache off the service. */
const graph: CanvasGraph = {
  nodes: [
    { id: 'n-1', kind: 'client', label: 'Buyer' },
    { id: 'n-2', kind: 'gateway', label: 'Gateway', config: { rateLimit: true } },
    { id: 'n-3', kind: 'service', label: 'Checkout' },
    { id: 'n-4', kind: 'database', label: 'Orders', config: { backups: true } },
    { id: 'n-5', kind: 'cache', label: 'Hot items' },
  ],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync' },
    { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync' },
    { id: 'e-3', source: 'n-3', target: 'n-4', kind: 'sync' },
    { id: 'e-4', source: 'n-3', target: 'n-5', kind: 'sync' },
  ],
};

const binding = (overrides: Partial<NfrBinding> = {}): NfrBinding => ({
  nfrId: 'nfr-1',
  mechanism: 'backups',
  nodeIds: ['n-4'],
  ...overrides,
});

const flow = (overrides: Partial<FlowBinding> = {}): FlowBinding => ({
  id: flowIdFor(0),
  requirementIndex: 0,
  path: ['e-1', 'e-2', 'e-3'],
  ...overrides,
});

describe('eligibleNodes', () => {
  it('offers only the kinds a claim can legally be carried by', () => {
    // The API rejects `dlq` on a client outright, so the picker must not list one.
    expect(eligibleNodes(graph, 'backups').map((node) => node.id)).toEqual(['n-4']);
    expect(eligibleNodes(graph, 'rate-limit').map((node) => node.id)).toEqual(['n-2']);
    expect(eligibleNodes(graph, 'dlq')).toEqual([]);
  });
});

describe('nextHops', () => {
  it('offers every edge for the first hop and only connecting edges after', () => {
    expect(nextHops(graph, []).map((edge) => edge.id)).toEqual(['e-1', 'e-2', 'e-3', 'e-4']);
    // From e-1 (…→ n-2) only edges leaving n-2 continue the walk.
    expect(nextHops(graph, ['e-1']).map((edge) => edge.id)).toEqual(['e-2']);
    // n-3 branches, so both are legal continuations.
    expect(nextHops(graph, ['e-1', 'e-2']).map((edge) => edge.id)).toEqual(['e-3', 'e-4']);
  });

  it('offers nothing once the walk reaches a component with no outgoing edge', () => {
    expect(nextHops(graph, ['e-3'])).toEqual([]);
  });
});

describe('walkNodes / flowIsComplete', () => {
  it('reads the walk back as the components it passes through', () => {
    expect(walkNodes(graph, ['e-1', 'e-2', 'e-3']).map((node) => node.id)).toEqual([
      'n-1',
      'n-2',
      'n-3',
      'n-4',
    ]);
  });

  it('is complete only from a client to somewhere the request comes to rest', () => {
    expect(flowIsComplete(graph, ['e-1', 'e-2', 'e-3'])).toBe(true);
    // Ends at a cache — real work, but not where the result is kept.
    expect(flowIsComplete(graph, ['e-1', 'e-2', 'e-4'])).toBe(false);
    // Reaches the database but does not start at a client.
    expect(flowIsComplete(graph, ['e-3'])).toBe(false);
    expect(flowIsComplete(graph, [])).toBe(false);
  });
});

/**
 * The API rejects an impossible brief and grades an unsupported one. These
 * pin the first half: every shape the server would 400 or 422 is dropped here
 * before it can be sent, and none of it is dropped for being merely unproven.
 */
describe('reconcileBrief', () => {
  it('emits the draft unchanged when the canvas still supports it', () => {
    expect(reconcileBrief([binding()], [flow()], graph)).toEqual({
      version: 1,
      nfrBindings: [binding()],
      flows: [flow()],
    });
  });

  it('keeps an uncorroborated claim — that claim is the lesson, not an error', () => {
    // A gateway can carry rate limiting; this one has none configured. The
    // engine will say so. The editor must not silently delete it.
    const unproven = binding({ mechanism: 'authentication', nodeIds: ['n-2'] });
    expect(reconcileBrief([unproven], [], graph)?.nfrBindings).toEqual([unproven]);
  });

  it('drops a node the canvas no longer has', () => {
    const stale = binding({ nodeIds: ['n-4', 'n-deleted'] });
    expect(reconcileBrief([stale], [], graph)?.nfrBindings).toEqual([
      binding({ nodeIds: ['n-4'] }),
    ]);
  });

  it('drops a node whose kind cannot carry the claim', () => {
    // Reachable by editing the canvas after binding: a bound database retyped
    // as a cache still cannot provide backups, and the API 422s on it.
    const wrongKind = binding({ nodeIds: ['n-4', 'n-5'] });
    expect(reconcileBrief([wrongKind], [], graph)?.nfrBindings).toEqual([
      binding({ nodeIds: ['n-4'] }),
    ]);
  });

  it('deduplicates node ids, which the API rejects but the live chip cannot see', () => {
    const doubled = binding({ nodeIds: ['n-4', 'n-4'] });
    expect(reconcileBrief([doubled], [], graph)?.nfrBindings).toEqual([
      binding({ nodeIds: ['n-4'] }),
    ]);
  });

  it('drops a binding left naming nothing rather than sending a self-harming claim', () => {
    expect(reconcileBrief([binding({ nodeIds: [] })], [], graph)).toBeNull();
  });

  it('truncates a walk at the first hop that no longer connects', () => {
    // e-4 leaves n-3, so it cannot follow e-3 which arrives at n-4.
    const broken = flow({ path: ['e-1', 'e-2', 'e-3', 'e-4'] });
    expect(reconcileBrief([], [broken], graph)?.flows).toEqual([
      flow({ path: ['e-1', 'e-2', 'e-3'] }),
    ]);
  });

  it('truncates a walk at an edge the canvas no longer has, and drops it if nothing survives', () => {
    expect(reconcileBrief([], [flow({ path: ['e-1', 'e-gone'] })], graph)?.flows).toEqual([
      flow({ path: ['e-1'] }),
    ]);
    expect(reconcileBrief([], [flow({ path: ['e-gone'] })], graph)).toBeNull();
  });

  /**
   * An empty brief is accepted by the API but grades exactly like silence,
   * while leaving a stored artifact that implies otherwise.
   */
  it('is null when nothing is claimed, so submit sends no brief at all', () => {
    expect(reconcileBrief([], [], graph)).toBeNull();
  });
});

describe('flowIdFor', () => {
  it('is unique per requirement without needing a clock', () => {
    expect(flowIdFor(0)).not.toBe(flowIdFor(1));
    expect(flowIdFor(3)).toBe('flow-3');
  });
});
