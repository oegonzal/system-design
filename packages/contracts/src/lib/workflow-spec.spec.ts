import { describe, expect, it } from 'vitest';

import type { CanvasEdge, CanvasGraph, CanvasNode, NodeKind, NodeOperation } from './canvas';
import { canvasMechanismGraph } from './mechanisms';
import type { WorkflowItemVerdict, WorkflowSpec } from './workflow-spec';
import {
  WORKFLOW_FULFILLERS,
  WORKFLOW_ITEM_CLASSES,
  fulfillableItems,
  judgeWorkflow,
  specAtDifficulty,
  transitionItemId,
  validateWorkflowSpec,
} from './workflow-spec';

const node = (
  id: string,
  kind: NodeKind,
  extra: { operations?: NodeOperation[]; config?: CanvasNode['config'] } = {},
): CanvasNode => ({ id, kind, label: `${kind}-${id}`, ...extra });

const edge = (id: string, source: string, target: string, carries?: string[]): CanvasEdge => ({
  id,
  source,
  target,
  ...(carries ? { carries } : {}),
});

const judge = (spec: WorkflowSpec, nodes: CanvasNode[], edges: CanvasEdge[] = []) =>
  judgeWorkflow(canvasMechanismGraph({ nodes, edges } satisfies CanvasGraph), spec);

const verdict = (spec: WorkflowSpec, nodes: CanvasNode[], edges: CanvasEdge[], itemId: string) => {
  const found = judge(spec, nodes, edges).items.find((item) => item.itemId === itemId);
  if (!found) throw new Error(`no verdict for ${itemId}`);
  return found;
};

const emptySpec: Omit<WorkflowSpec, 'version'> = {
  entities: [],
  operations: [],
  events: [],
  aggregations: [],
  ingests: [],
};
const spec = (overrides: Partial<Omit<WorkflowSpec, 'version'>>): WorkflowSpec => ({
  version: 1,
  ...emptySpec,
  ...overrides,
});

describe('the workflow vocabulary', () => {
  it('files every item class under an eligibility rule', () => {
    for (const itemClass of WORKFLOW_ITEM_CLASSES) {
      expect(WORKFLOW_FULFILLERS[itemClass].roles.length).toBeGreaterThan(0);
      expect(WORKFLOW_FULFILLERS[itemClass].opKinds.length).toBeGreaterThan(0);
    }
  });

  it('[PRD-2] offers only role- and kind-eligible items to fulfil — coverage is a reference, never a name match', () => {
    const full = spec({
      operations: [
        { id: 'op-c', kind: 'command', statement: 'do' },
        { id: 'op-q', kind: 'query', statement: 'read' },
      ],
      events: [{ id: 'evt-a', statement: 'happened' }],
      aggregations: [{ id: 'agg-1', statement: 'total', sourceEventIds: ['evt-a'] }],
      ingests: [{ id: 'ing-p', mode: 'push', statement: 'in', nfrId: 'n1', emits: ['evt-a'] }],
    });
    expect(fulfillableItems(full, 'api', 'command').map((i) => i.id)).toEqual(['op-c', 'ing-p']);
    expect(fulfillableItems(full, 'api', 'query').map((i) => i.id)).toEqual(['op-q', 'agg-1']);
    expect(fulfillableItems(full, 'channel', 'event').map((i) => i.id)).toEqual(['evt-a']);
    expect(fulfillableItems(full, 'storage', 'command')).toEqual([]);
    expect(fulfillableItems(full, 'api', 'event')).toEqual([]);
    // event-handler declares operations like an api: same command/query offerings.
    expect(fulfillableItems(full, 'event-handler', 'command').map((i) => i.id)).toEqual([
      'op-c',
      'ing-p',
    ]);
    expect(fulfillableItems(full, 'event-handler', 'query').map((i) => i.id)).toEqual([
      'op-q',
      'agg-1',
    ]);
  });
});

describe('judgeWorkflow — operations', () => {
  const opSpec = spec({ operations: [{ id: 'op-c', kind: 'command', statement: 'do' }] });

  it('reports an undeclared operation unclaimed', () => {
    expect(verdict(opSpec, [node('s', 'service')], [], 'op-c')).toMatchObject({
      status: 'unclaimed',
      gaps: ['no-declaration'],
    });
  });

  it('contradicts a command item fulfilled only by a query op — the canvas says the opposite', () => {
    const nodes = [
      node('s', 'service', {
        operations: [{ name: 'read', kind: 'query', fulfills: 'op-c' }],
      }),
    ];
    expect(verdict(opSpec, nodes, [], 'op-c')).toMatchObject({
      status: 'contradicted',
      gaps: ['ineligible-declaration'],
      evidenceNodeIds: ['s'],
    });
  });

  it('leaves a declared-but-uncarried operation uncorroborated', () => {
    const nodes = [
      node('s', 'service', {
        operations: [{ name: 'do', kind: 'command', fulfills: 'op-c' }],
      }),
    ];
    expect(verdict(opSpec, nodes, [], 'op-c')).toMatchObject({
      status: 'uncorroborated',
      gaps: ['not-exercised'],
    });
  });

  it('corroborates a carried operation, with the exercising edge as evidence', () => {
    const nodes = [
      node('c', 'client'),
      node('s', 'service', {
        operations: [{ name: 'do', kind: 'command', fulfills: 'op-c' }],
      }),
    ];
    const edges = [edge('e1', 'c', 's', ['do'])];
    expect(verdict(opSpec, nodes, edges, 'op-c')).toMatchObject({
      status: 'corroborated',
      evidenceNodeIds: ['s'],
      evidenceEdgeIds: ['e1'],
      gaps: [],
    });
  });

  it('corroborates an async-consumed command through its channel — no fake sync call needed', () => {
    // The consumer's own op is structurally uncarryable on a channel-owned
    // edge, so consuming the channel that transports the events the spec
    // says this command runs on IS the exercise.
    const consumerSpec = spec({
      operations: [{ id: 'op-c', kind: 'command', statement: 'do', consumes: ['evt-m'] }],
      events: [{ id: 'evt-m', statement: 'a message arrived' }],
    });
    const nodes = [
      node('q', 'queue', { operations: [{ name: 'MsgT', kind: 'event', fulfills: 'evt-m' }] }),
      node('w', 'worker', {
        operations: [{ name: 'handle', kind: 'command', fulfills: 'op-c' }],
      }),
    ];
    const edges = [edge('e1', 'q', 'w', ['MsgT'])];
    expect(verdict(consumerSpec, nodes, edges, 'op-c')).toMatchObject({
      status: 'corroborated',
      evidenceNodeIds: ['w'],
      evidenceEdgeIds: ['e1'],
    });
  });

  it('never blanket-credits a stacked command the consume edge does not feed', () => {
    // One consume edge, two commands on the node: only the one whose declared
    // consumption the channel transports is exercised. Without the event
    // link, stacking every spec command on any consumer would game the
    // write-contract half of the dimension with a single edge.
    const stacked = spec({
      operations: [
        { id: 'op-c', kind: 'command', statement: 'do', consumes: ['evt-m'] },
        { id: 'op-on-demand', kind: 'command', statement: 'resync on demand' },
      ],
      events: [{ id: 'evt-m', statement: 'a message arrived' }],
    });
    const nodes = [
      node('q', 'queue', { operations: [{ name: 'MsgT', kind: 'event', fulfills: 'evt-m' }] }),
      node('w', 'worker', {
        operations: [
          { name: 'handle', kind: 'command', fulfills: 'op-c' },
          { name: 'resync', kind: 'command', fulfills: 'op-on-demand' },
        ],
      }),
    ];
    const edges = [edge('e1', 'q', 'w', ['MsgT'])];
    expect(verdict(stacked, nodes, edges, 'op-c').status).toBe('corroborated');
    expect(verdict(stacked, nodes, edges, 'op-on-demand')).toMatchObject({
      status: 'uncorroborated',
      gaps: ['not-exercised'],
    });
  });

  it('does not extend the async-consumer branch to queries', () => {
    const qSpec = spec({
      operations: [{ id: 'op-q', kind: 'query', statement: 'read' }],
      events: [{ id: 'evt-m', statement: 'a message arrived' }],
    });
    const nodes = [
      node('q', 'queue', { operations: [{ name: 'MsgT', kind: 'event', fulfills: 'evt-m' }] }),
      node('w', 'service', {
        operations: [{ name: 'read', kind: 'query', fulfills: 'op-q' }],
      }),
    ];
    const edges = [edge('e1', 'q', 'w', ['MsgT'])];
    expect(verdict(qSpec, nodes, edges, 'op-q').status).toBe('uncorroborated');
  });
});

describe('judgeWorkflow — events', () => {
  const evtSpec = spec({ events: [{ id: 'evt-a', statement: 'happened' }] });
  const transport = () =>
    node('st', 'event-stream', {
      operations: [{ name: 'EvtA', kind: 'event', fulfills: 'evt-a' }],
    });
  const producer = () =>
    node('svc', 'service', {
      operations: [{ name: 'do', kind: 'command', emits: ['evt-a'] }],
    });
  const consumer = () => node('w', 'worker');

  it('is unclaimed when nothing declares or emits it', () => {
    expect(verdict(evtSpec, [node('s', 'service')], [], 'evt-a').status).toBe('unclaimed');
  });

  it('contradicts an event fulfilled outside a channel', () => {
    const nodes = [
      node('s', 'service', { operations: [{ name: 'x', kind: 'command', fulfills: 'evt-a' }] }),
    ];
    expect(verdict(evtSpec, nodes, [], 'evt-a').status).toBe('contradicted');
  });

  it('names the missing halves: producer, then consumer', () => {
    const noProducer = verdict(
      evtSpec,
      [transport(), consumer()],
      [edge('e1', 'st', 'w', ['EvtA'])],
      'evt-a',
    );
    expect(noProducer.status).toBe('uncorroborated');
    expect(noProducer.gaps).toContain('no-producer');

    const noConsumer = verdict(
      evtSpec,
      [transport(), producer()],
      [edge('e1', 'svc', 'st', ['EvtA'])],
      'evt-a',
    );
    expect(noConsumer.status).toBe('uncorroborated');
    expect(noConsumer.gaps).toContain('no-consumer');
  });

  it('an emits claim with no transport is uncorroborated with no-transport, not unclaimed', () => {
    const only = verdict(evtSpec, [producer()], [], 'evt-a');
    expect(only.status).toBe('uncorroborated');
    expect(only.gaps).toContain('no-transport');
  });

  it('corroborates the full producer → channel → consumer story', () => {
    const nodes = [transport(), producer(), consumer()];
    const edges = [edge('e1', 'svc', 'st', ['EvtA']), edge('e2', 'st', 'w', ['EvtA'])];
    expect(verdict(evtSpec, nodes, edges, 'evt-a')).toMatchObject({
      status: 'corroborated',
      evidenceNodeIds: ['st', 'svc', 'w'],
      evidenceEdgeIds: ['e1', 'e2'],
    });
  });

  it('ignores emits on query ops for producer evidence', () => {
    const nodes = [
      transport(),
      node('svc', 'service', { operations: [{ name: 'r', kind: 'query', emits: ['evt-a'] }] }),
      consumer(),
    ];
    const edges = [edge('e1', 'svc', 'st', ['EvtA']), edge('e2', 'st', 'w', ['EvtA'])];
    expect(verdict(evtSpec, nodes, edges, 'evt-a').gaps).toContain('no-producer');
  });
});

describe('judgeWorkflow — ingests', () => {
  const pushSpec = spec({
    ingests: [{ id: 'ing-p', mode: 'push', statement: 'in', nfrId: 'n1', emits: [] }],
  });
  const pullSpec = spec({
    ingests: [{ id: 'ing-l', mode: 'pull', statement: 'poll', nfrId: 'n2', emits: [] }],
  });

  it('push: requires the in-edge to come from an external source marked as pushing webhooks', () => {
    const receiver = node('svc', 'service', {
      operations: [{ name: 'hook', kind: 'command', fulfills: 'ing-p' }],
    });

    const silent = verdict(
      pushSpec,
      [node('x', 'external-api'), receiver],
      [edge('e1', 'x', 'svc', ['hook'])],
      'ing-p',
    );
    expect(silent.status).toBe('uncorroborated');
    expect(silent.gaps).toEqual(['no-external-source']);

    const marked = verdict(
      pushSpec,
      [node('x', 'external-api', { config: { webhooks: true } }), receiver],
      [edge('e1', 'x', 'svc', ['hook'])],
      'ing-p',
    );
    expect(marked).toMatchObject({
      status: 'corroborated',
      evidenceNodeIds: ['svc', 'x'],
      evidenceEdgeIds: ['e1'],
    });
  });

  it('pull: wants an external target and a periodic driver, and names whichever is missing', () => {
    const poller = (kind: NodeKind) =>
      node('p', kind, { operations: [{ name: 'poll', kind: 'command', fulfills: 'ing-l' }] });

    const adrift = verdict(
      pullSpec,
      [poller('service'), node('x', 'external-api')],
      [edge('e1', 'p', 'x')],
      'ing-l',
    );
    expect(adrift.gaps).toEqual(['no-periodic-driver']);

    const untargeted = verdict(pullSpec, [poller('batch-job')], [], 'ing-l');
    expect(untargeted.gaps).toEqual(['no-external-target']);

    const batch = verdict(
      pullSpec,
      [poller('batch-job'), node('x', 'external-api')],
      [edge('e1', 'p', 'x')],
      'ing-l',
    );
    expect(batch.status).toBe('corroborated');

    const scheduled = verdict(
      pullSpec,
      [poller('service'), node('x', 'external-api'), node('sch', 'scheduler')],
      [edge('e1', 'p', 'x'), edge('e2', 'sch', 'p')],
      'ing-l',
    );
    expect(scheduled).toMatchObject({
      status: 'corroborated',
      evidenceNodeIds: ['p', 'sch', 'x'],
    });
  });
});

describe('judgeWorkflow — aggregations, transitions, entities', () => {
  const fullSpec = spec({
    operations: [{ id: 'op-c', kind: 'command', statement: 'do', emits: ['evt-a'] }],
    events: [{ id: 'evt-a', statement: 'happened' }],
    aggregations: [{ id: 'agg-1', statement: 'total', sourceEventIds: ['evt-a'] }],
    entities: [
      {
        id: 'ent-1',
        name: 'Thing',
        states: ['s1', 's2'],
        transitions: [
          { from: null, to: 's1', via: 'op-c' },
          { from: 's1', to: 's2', via: 'evt-a' },
        ],
      },
    ],
  });

  const wiredNodes = () => [
    node('c', 'client'),
    node('svc', 'service', {
      operations: [
        { name: 'do', kind: 'command', fulfills: 'op-c', emits: ['evt-a'] },
        { name: 'total', kind: 'query', fulfills: 'agg-1' },
      ],
    }),
    node('st', 'event-stream', {
      operations: [{ name: 'EvtA', kind: 'event', fulfills: 'evt-a' }],
    }),
    node('w', 'worker'),
    node('db', 'database'),
  ];
  const wiredEdges = () => [
    edge('e1', 'c', 'svc', ['do', 'total']),
    edge('e2', 'svc', 'st', ['EvtA']),
    edge('e3', 'st', 'w', ['EvtA']),
    edge('e4', 'w', 'db'),
    edge('e5', 'svc', 'db'),
  ];

  it('corroborates a fed and served aggregation — the stream demonstrably reaches what the tile reads', () => {
    expect(verdict(fullSpec, wiredNodes(), wiredEdges(), 'agg-1').status).toBe('corroborated');
  });

  it('flags a served aggregation whose source events do not flow — a dashboard with no stream behind it', () => {
    const nodes = wiredNodes();
    const edges = wiredEdges().filter((e) => e.id !== 'e3'); // no consumer → evt-a uncorroborated
    const agg = verdict(fullSpec, nodes, edges, 'agg-1');
    expect(agg.status).toBe('uncorroborated');
    expect(agg.gaps).toContain('not-fed');
  });

  it('flags an unserved aggregation', () => {
    const nodes = wiredNodes().map((n) =>
      n.id === 'svc'
        ? {
            ...n,
            operations: (n.operations ?? []).filter((op) => op.fulfills !== 'agg-1'),
          }
        : n,
    );
    const agg = verdict(fullSpec, nodes, wiredEdges(), 'agg-1');
    expect(agg.status).toBe('uncorroborated');
    expect(agg.gaps).toContain('not-served');
  });

  it('feeds an aggregation through ANY serving node — never just the first in canvas order', () => {
    // A gateway also (legally) serves the aggregate but is not fed; the
    // properly fed service sits later in the nodes array. Which node happens
    // to come first must never decide the verdict.
    const nodes = [
      node('gw', 'gateway', {
        operations: [{ name: 'total', kind: 'query', fulfills: 'agg-1' }],
      }),
      ...wiredNodes(),
    ];
    const edges = [...wiredEdges(), edge('e8', 'c', 'gw', ['total'])];
    expect(verdict(fullSpec, nodes, edges, 'agg-1').status).toBe('corroborated');
  });

  it('derives transition and entity verdicts from their via items — no state-machine editor required', () => {
    const report = judge(fullSpec, wiredNodes(), wiredEdges());
    const byId = new Map(report.items.map((item) => [item.itemId, item] as const));
    expect(byId.get(transitionItemId('ent-1', 0))?.status).toBe('corroborated');
    expect(byId.get(transitionItemId('ent-1', 1))?.status).toBe('corroborated');
    expect(byId.get('ent-1')?.status).toBe('corroborated');

    const silent = judge(fullSpec, [node('s', 'service')], []);
    const entity = silent.items.find((item) => item.itemId === 'ent-1') as WorkflowItemVerdict;
    expect(entity.status).toBe('unclaimed');
  });
});

describe('specAtDifficulty', () => {
  const laddered = spec({
    operations: [
      { id: 'op-a', kind: 'command', statement: 'a', emits: ['evt-late'] },
      { id: 'op-late', kind: 'query', statement: 'late', minDifficulty: 'standard' },
    ],
    events: [
      { id: 'evt-a', statement: 'a' },
      { id: 'evt-late', statement: 'late', minDifficulty: 'standard' },
    ],
    aggregations: [
      {
        id: 'agg-late',
        statement: 'late',
        sourceEventIds: ['evt-late'],
        minDifficulty: 'standard',
      },
    ],
    ingests: [
      { id: 'ing-a', mode: 'push', statement: 'a', nfrId: 'n', emits: ['evt-a', 'evt-late'] },
    ],
    entities: [
      {
        id: 'ent-1',
        name: 'Thing',
        states: ['s1', 's2', 's3'],
        transitions: [
          { from: null, to: 's1', via: 'ing-a' },
          { from: 's1', to: 's2', via: 'op-a' },
          { from: 's2', to: 's3', via: 'evt-late' },
        ],
      },
    ],
  });

  it('keeps the filtered view closed: emits, transitions and states drop with their items', () => {
    const intro = specAtDifficulty(laddered, 'intro');
    expect(intro.operations.map((op) => op.id)).toEqual(['op-a']);
    expect(intro.operations[0].emits).toBeUndefined();
    expect(intro.events.map((event) => event.id)).toEqual(['evt-a']);
    expect(intro.aggregations).toEqual([]);
    expect(intro.ingests[0].emits).toEqual(['evt-a']);
    expect(intro.entities[0].transitions).toHaveLength(2);
    expect(intro.entities[0].states).toEqual(['s1', 's2']);
    expect(validateWorkflowSpec(intro)).toEqual([]);
  });

  it('is the identity at a difficulty every item clears', () => {
    const standard = specAtDifficulty(laddered, 'standard');
    expect(standard.operations.map((op) => op.id)).toEqual(['op-a', 'op-late']);
    expect(standard.aggregations.map((agg) => agg.id)).toEqual(['agg-late']);
    expect(standard.entities[0].states).toEqual(['s1', 's2', 's3']);
    expect(validateWorkflowSpec(standard)).toEqual([]);
  });
});

describe('validateWorkflowSpec', () => {
  it('collects every closure violation instead of stopping at the first', () => {
    const broken = spec({
      operations: [
        { id: 'op-a', kind: 'command', statement: 'a', emits: ['evt-missing'] },
        { id: 'op-a', kind: 'query', statement: 'dup' },
      ],
      events: [],
      aggregations: [{ id: 'agg-1', statement: 'x', sourceEventIds: [] }],
      ingests: [{ id: 'ing-a', mode: 'pull', statement: 'x', nfrId: '', emits: ['evt-missing'] }],
      entities: [
        {
          id: 'ent-1',
          name: 'T',
          states: ['s1'],
          transitions: [{ from: 'ghost', to: 's1', via: 'op-missing' }],
        },
      ],
    });
    const problems = validateWorkflowSpec(broken);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate workflow id'),
        expect.stringContaining("emits unknown event 'evt-missing'"),
        expect.stringContaining('has no sources'),
        expect.stringContaining('names no NFR'),
        expect.stringContaining('leaves unknown state'),
        expect.stringContaining("via unknown item 'op-missing'"),
      ]),
    );
  });
});
