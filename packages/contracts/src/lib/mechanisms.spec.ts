import { describe, expect, it } from 'vitest';

import type { CanvasEdge, CanvasGraph, CanvasNode, NodeConfig, NodeKind } from './canvas';
import {
  MECHANISM_CLAIMS,
  MECHANISM_DISPROOF,
  MECHANISM_EVIDENCE,
  MECHANISM_KINDS,
  canvasMechanismGraph,
  judgeMechanism,
  type MechanismClaim,
} from './mechanisms';

const node = (id: string, kind: NodeKind, config?: NodeConfig): CanvasNode => ({
  id,
  kind,
  label: `${kind}-${id}`,
  ...(config ? { config } : {}),
});

const edge = (id: string, source: string, target: string): CanvasEdge => ({ id, source, target });

const graphOf = (nodes: CanvasNode[], edges: CanvasEdge[] = []): CanvasGraph => ({ nodes, edges });

const evidenceFor = (claim: MechanismClaim, graph: CanvasGraph): string[] =>
  MECHANISM_EVIDENCE[claim](canvasMechanismGraph(graph));

describe('the mechanism vocabulary', () => {
  it('can verify every claim it lets an author make', () => {
    // The discipline that keeps the vocabulary honest: a claim with no way to
    // prove it would be a token, and tokens are what substring grading was.
    for (const claim of MECHANISM_CLAIMS) {
      expect(typeof MECHANISM_EVIDENCE[claim], `no evidence for "${claim}"`).toBe('function');
      expect(MECHANISM_KINDS[claim].length, `no eligible kinds for "${claim}"`).toBeGreaterThan(0);
    }
  });

  it('only ever produces evidence on kinds it declares eligible', () => {
    // Every kind, configured maximally — if a predicate credits a kind its
    // eligibility list omits, the API and editor would disagree with the score.
    const everything = graphOf(
      MECHANISM_CLAIMS.flatMap((claim, index) =>
        MECHANISM_KINDS[claim].map((kind, offset) =>
          node(`${index}-${offset}`, kind, {
            rateLimit: true,
            authMode: 'jwt',
            consistency: 'strong',
            backups: true,
            multiRegion: true,
            sharding: 'hash',
            partitions: 8,
            idempotent: true,
            dlq: true,
            delivery: 'at-least-once',
            retentionHours: 168,
            autoscaling: true,
          }),
        ),
      ),
    );

    for (const claim of MECHANISM_CLAIMS) {
      const eligible = new Set<NodeKind>(MECHANISM_KINDS[claim]);
      const credited = evidenceFor(claim, everything)
        .map((id) => everything.nodes.find((candidate) => candidate.id === id))
        .filter((found): found is CanvasNode => found !== undefined);
      for (const found of credited) {
        expect(eligible.has(found.kind), `"${claim}" credited an ineligible ${found.kind}`).toBe(
          true,
        );
      }
    }
  });
});

describe('evidence is read off structure, not words', () => {
  it('credits a knob the canvas actually declares', () => {
    const withDlq = graphOf([node('q-1', 'queue', { dlq: true })]);
    expect(evidenceFor('dlq', withDlq)).toEqual(['q-1']);

    const withoutDlq = graphOf([node('q-1', 'queue')]);
    expect(evidenceFor('dlq', withoutDlq)).toEqual([]);
  });

  it('accepts either spelling of a capability — the knob or the declared interface', () => {
    const knob = graphOf([node('w-1', 'worker', { idempotent: true })]);
    expect(evidenceFor('idempotency', knob)).toEqual(['w-1']);

    const declared = graphOf([
      {
        id: 'w-1',
        kind: 'worker',
        label: 'Step worker',
        operations: [{ name: 'runStep', kind: 'command', idempotent: true }],
      },
    ]);
    expect(evidenceFor('idempotency', declared)).toEqual(['w-1']);
  });

  it('reads a cache as a read path only when it fronts something durable', () => {
    const onPath = graphOf(
      [node('c-1', 'client'), node('k-1', 'cache'), node('d-1', 'database')],
      [edge('e-1', 'c-1', 'k-1'), edge('e-2', 'k-1', 'd-1')],
    );
    expect(evidenceFor('read-cache', onPath)).toEqual(['k-1']);

    // Reachable, but the system of record is not behind it.
    const dangling = graphOf(
      [node('c-1', 'client'), node('k-1', 'cache'), node('d-1', 'database')],
      [edge('e-1', 'c-1', 'k-1')],
    );
    expect(evidenceFor('read-cache', dangling)).toEqual([]);

    // Cache-aside: the reader, not the cache, continues to the store on a miss.
    const aside = graphOf(
      [
        node('c-1', 'client'),
        node('s-1', 'service'),
        node('k-1', 'cache'),
        node('d-1', 'database'),
      ],
      [edge('e-1', 'c-1', 's-1'), edge('e-2', 's-1', 'k-1'), edge('e-3', 's-1', 'd-1')],
    );
    expect(evidenceFor('read-cache', aside)).toEqual(['k-1']);
  });

  it('reads a channel as a buffer only when something fills it and something drains it', () => {
    const buffered = graphOf(
      [node('s-1', 'service'), node('q-1', 'queue'), node('w-1', 'worker')],
      [edge('e-1', 's-1', 'q-1'), edge('e-2', 'q-1', 'w-1')],
    );
    expect(evidenceFor('queue-buffer', buffered)).toEqual(['q-1']);

    const unattended = graphOf(
      [node('s-1', 'service'), node('q-1', 'queue')],
      [edge('e-1', 's-1', 'q-1')],
    );
    expect(evidenceFor('queue-buffer', unattended)).toEqual([]);
  });

  it('is indifferent to labels, which is the whole point', () => {
    const plain = graphOf([node('d-1', 'database', { backups: true })]);
    const renamed = graphOf([
      { id: 'd-1', kind: 'database', label: 'Grimoire of Orders ✨', config: { backups: true } },
    ]);
    expect(evidenceFor('backups', renamed)).toEqual(evidenceFor('backups', plain));
  });
});

describe('disproof is not the absence of proof', () => {
  it('separates "the canvas says no" from "the canvas says nothing"', () => {
    const silent = canvasMechanismGraph(graphOf([node('d-1', 'database')]));
    const denied = canvasMechanismGraph(graphOf([node('d-1', 'database', { backups: false })]));

    expect(MECHANISM_DISPROOF.backups?.(silent)).toEqual([]);
    expect(MECHANISM_DISPROOF.backups?.(denied)).toEqual(['d-1']);
  });
});

describe('judgeMechanism', () => {
  const graph = canvasMechanismGraph(
    graphOf([
      node('d-1', 'database', { consistency: 'strong' }),
      node('d-2', 'database', { consistency: 'eventual' }),
      node('d-3', 'database'),
    ]),
  );

  it('partitions a claim into proved, silent, denied and unclaimed', () => {
    const verdict = judgeMechanism(graph, 'strong-consistency', ['d-1', 'd-2', 'd-3']);
    expect(verdict.corroborated).toEqual(['d-1']);
    expect(verdict.contradicted).toEqual(['d-2']);
    expect(verdict.uncorroborated).toEqual(['d-3']);
    expect(verdict.unclaimed).toEqual([]);
  });

  it('reports evidence the author never took credit for', () => {
    expect(judgeMechanism(graph, 'strong-consistency', []).unclaimed).toEqual(['d-1']);
  });

  it('gains nothing from naming more components — the shotgun earns no coverage', () => {
    const honest = judgeMechanism(graph, 'strong-consistency', ['d-1']);
    const shotgun = judgeMechanism(graph, 'strong-consistency', ['d-1', 'd-2', 'd-3']);
    expect(shotgun.corroborated).toEqual(honest.corroborated);
    expect(shotgun.uncorroborated.length).toBeGreaterThan(honest.uncorroborated.length);
  });
});

describe('canvasMechanismGraph', () => {
  it('follows edges forwards only', () => {
    const graph = canvasMechanismGraph(
      graphOf(
        [node('a', 'client'), node('b', 'service'), node('c', 'database')],
        [edge('e-1', 'a', 'b'), edge('e-2', 'b', 'c')],
      ),
    );
    expect(graph.reaches('a', 'c')).toBe(true);
    expect(graph.reaches('c', 'a')).toBe(false);
    expect(graph.reaches('a', 'a')).toBe(false);
  });

  it('terminates on a cycle', () => {
    const graph = canvasMechanismGraph(
      graphOf(
        [node('a', 'service'), node('b', 'service')],
        [edge('e-1', 'a', 'b'), edge('e-2', 'b', 'a')],
      ),
    );
    expect(graph.reaches('a', 'b')).toBe(true);
  });
});
