import { describe, expect, it } from 'vitest';

import { EDGE_CONFIG_HINTS, NODE_KINDS, type NodeKind } from './canvas';
import type { CanvasGraph } from './canvas.schema';
import {
  LIFECYCLE_SECTION_HEADING,
  LIFECYCLE_STAGES,
  nodeReach,
  pathStages,
  renderLifecycleSection,
  REQUEST_ENTRIES,
  requestEntryOf,
  REST_ROLES,
  servicesForStage,
  walkOf,
} from './lifecycle';
import { PLATFORM_IDS, platformCatalogue } from './platforms';

const MAX_LINE = 160;

const node = (id: string, kind: NodeKind) => ({ id, kind, label: '' });
const edge = (id: string, source: string, target: string, config?: Record<string, string>) => ({
  id,
  source,
  target,
  kind: 'sync' as const,
  ...(config ? { config: Object.entries(config).map(([key, value]) => ({ key, value })) } : {}),
});

/** A client straight into the gateway: the way in shows only the access layer. */
const bare: CanvasGraph = {
  nodes: [
    node('client', 'client'),
    node('gw', 'gateway'),
    node('svc', 'service'),
    node('db', 'database'),
  ],
  edges: [edge('e1', 'client', 'gw'), edge('e2', 'gw', 'svc'), edge('e3', 'svc', 'db')],
};

/** Every stage served: two on the path, one by hop keys, two beside the gateway. */
const complete: CanvasGraph = {
  nodes: [
    node('client', 'client'),
    node('dns', 'dns'),
    node('cdn', 'cdn'),
    node('gw', 'gateway'),
    node('svc', 'service'),
    node('db', 'database'),
    node('waf', 'waf'),
    node('auth', 'auth-service'),
    node('cache', 'cache'),
    node('metrics', 'monitoring'),
  ],
  edges: [
    edge('e1', 'client', 'dns'),
    edge('e2', 'dns', 'cdn'),
    edge('e3', 'cdn', 'gw', { tls: 'ends at the edge', auth: 'jwt' }),
    edge('e4', 'gw', 'svc'),
    edge('e5', 'svc', 'db'),
    edge('e6', 'waf', 'gw'),
    edge('e7', 'gw', 'auth'),
    edge('e8', 'svc', 'cache'),
  ],
};
const COMPLETE_PATH = ['e1', 'e2', 'e3', 'e4', 'e5'];

const coverage = (graph: CanvasGraph, path: string[]) =>
  Object.fromEntries(pathStages(graph, path).stages.map((item) => [item.stage.id, item.covered]));

describe('the request lifecycle', () => {
  it('[EVAL-7] declares stages, entries and resting roles over the canvas vocabulary, bounded like the guide', () => {
    const kinds: readonly string[] = NODE_KINDS;
    const hints: readonly string[] = EDGE_CONFIG_HINTS;
    const stageIds = new Set<string>(LIFECYCLE_STAGES.map((stage) => stage.id));
    for (const stage of LIFECYCLE_STAGES) {
      expect(stage.what.length).toBeLessThanOrEqual(MAX_LINE);
      expect(stage.roles.length).toBeGreaterThan(0);
      for (const role of stage.roles) expect(kinds).toContain(role);
      for (const key of stage.hopKeys) expect(hints).toContain(key);
    }
    const entryRoles = REQUEST_ENTRIES.flatMap((entry) => entry.roles);
    expect(new Set(entryRoles).size).toBe(entryRoles.length);
    for (const entry of REQUEST_ENTRIES) {
      for (const role of entry.roles) expect(kinds).toContain(role);
      for (const id of [...entry.stages, ...entry.conditional]) expect(stageIds.has(id)).toBe(true);
    }
    for (const role of REST_ROLES) expect(kinds).toContain(role);
    expect(requestEntryOf('client')?.id).toBe('client');
    expect(requestEntryOf('actor')?.id).toBe('client');
    expect(requestEntryOf('payment-provider')?.id).toBe('partner');
    expect(requestEntryOf('queue')?.id).toBe('inside');
    expect(requestEntryOf('service')).toBeNull();
  });

  it('[EVAL-7] traces a path: where it enters, which block or hop serves each stage of the way in, and where it comes to rest', () => {
    const thin = pathStages(bare, ['e1', 'e2', 'e3']);
    expect(thin.entry?.id).toBe('client');
    expect(thin.firstNodeId).toBe('client');
    expect(coverage(bare, ['e1', 'e2', 'e3'])).toEqual({
      'name-resolution': null,
      'transport-security': null,
      'edge-delivery': null,
      'edge-protection': null,
      ingress: { by: 'node', nodeId: 'gw', beside: null },
      identity: null,
    });
    expect(thin.stages.find((item) => item.stage.id === 'edge-delivery')?.conditional).toBe(true);
    expect(thin.rest).toEqual({ nodeId: 'db', kind: 'database', atRest: true });

    expect(coverage(complete, COMPLETE_PATH)).toEqual({
      'name-resolution': { by: 'node', nodeId: 'dns', beside: null },
      'transport-security': { by: 'hop', edgeId: 'e3', key: 'tls' },
      'edge-delivery': { by: 'node', nodeId: 'cdn', beside: null },
      'edge-protection': { by: 'node', nodeId: 'waf', beside: 'gw' },
      ingress: { by: 'node', nodeId: 'gw', beside: null },
      identity: { by: 'node', nodeId: 'auth', beside: 'gw' },
    });
  });

  it('[EVAL-7] a path that begins inside the system or past the entry has no way in to judge, and an empty or broken path stops where it breaks', () => {
    const inside: CanvasGraph = {
      nodes: [node('tick', 'scheduler'), node('w', 'worker'), node('db', 'database')],
      edges: [edge('e1', 'tick', 'w'), edge('e2', 'w', 'db')],
    };
    const scheduled = pathStages(inside, ['e1', 'e2']);
    expect(scheduled.entry?.id).toBe('inside');
    expect(scheduled.stages).toEqual([]);
    expect(scheduled.rest?.atRest).toBe(true);

    const midway = pathStages(bare, ['e2', 'e3']);
    expect(midway.entry).toBeNull();
    expect(midway.firstNodeId).toBe('gw');
    expect(midway.stages).toEqual([]);

    expect(pathStages(bare, [])).toEqual({
      entry: null,
      firstNodeId: null,
      stages: [],
      rest: null,
    });
    expect(walkOf(bare, ['e1', 'missing', 'e2'])).toEqual(['client', 'gw']);
    expect(walkOf(bare, ['e1', 'e3'])).toEqual(['client', 'gw']);
  });

  it('[EVAL-7] a block a request passes through counts only on the path; one that serves the block it is joined to counts beside it', () => {
    // The gateway is joined to the resolver, but the walk stops before it: the access layer is not served.
    const short = coverage(complete, ['e1']);
    expect(short.ingress).toBeNull();
    expect(short['edge-delivery']).toBeNull();
    // A firewall joined to a block on the walk serves it from beside.
    expect(coverage(complete, ['e1', 'e2', 'e3'])['edge-protection']).toEqual({
      by: 'node',
      nodeId: 'waf',
      beside: 'gw',
    });
  });

  it('[EVAL-7] a path ending at a block that passes the request on is not at rest', () => {
    expect(pathStages(bare, ['e1']).rest).toEqual({ nodeId: 'gw', kind: 'gateway', atRest: false });
    expect(pathStages(bare, ['e1', 'e2']).rest?.atRest).toBe(false);
  });

  it('[EVAL-7] reports how every component is reached by the traced paths, and whether a binding names it', () => {
    const reach = nodeReach(complete, [
      { nodeIds: ['client', 'svc', 'metrics'], path: COMPLETE_PATH },
      { nodeIds: ['db'] },
    ]);
    const byId = Object.fromEntries(reach.map((item) => [item.nodeId, [item.reach, item.bound]]));
    expect(byId).toEqual({
      client: ['on-path', true],
      dns: ['on-path', false],
      cdn: ['on-path', false],
      gw: ['on-path', false],
      svc: ['on-path', true],
      db: ['on-path', true],
      waf: ['beside-path', false],
      auth: ['beside-path', false],
      cache: ['beside-path', false],
      metrics: ['untraced', true],
    });
  });

  it('[GEN-8] renders the section: its heading once, every entry and stage, the resting roles, and services by role only on a platform', () => {
    const neutral = renderLifecycleSection(null);
    expect(neutral.startsWith(`${LIFECYCLE_SECTION_HEADING}\n`)).toBe(true);
    expect(neutral).not.toContain('Services:');
    for (const entry of REQUEST_ENTRIES) expect(neutral).toContain(`- ${entry.label} (`);
    for (const stage of LIFECYCLE_STAGES)
      expect(neutral).toContain(`- ${stage.label} — ${stage.what}`);
    expect(neutral).toContain(
      'Blocks: api gateway, realtime gateway, load balancer, service mesh (on the path)',
    );
    expect(neutral).toContain('Blocks: waf (on or beside the path)');
    expect(neutral).toContain('no way in to show');
    expect(neutral).toContain('### Rest');

    const [platform] = PLATFORM_IDS;
    const catalogue = platformCatalogue(platform);
    const rendered = renderLifecycleSection(catalogue);
    for (const stage of LIFECYCLE_STAGES) {
      const services = servicesForStage(catalogue, stage);
      expect(services.length, stage.id).toBeGreaterThan(0);
      for (const service of services) {
        expect(
          service.roles.some((role) => (stage.roles as readonly NodeKind[]).includes(role)),
        ).toBe(true);
        expect(rendered).toContain(`\`${service.id}\``);
      }
      const playing = catalogue.services.filter((service) =>
        service.roles.some((role) => (stage.roles as readonly NodeKind[]).includes(role)),
      );
      expect(services.map((service) => service.id)).toEqual(playing.map((service) => service.id));
    }
  });
});
