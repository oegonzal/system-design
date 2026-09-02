import { describe, expect, it } from 'vitest';

import type { CanvasGraph, CanvasNode, NodeKind } from './canvas';
import {
  type DesignNarrative,
  narrationHasClaims,
  projectNarration,
  readsAsProse,
} from './narration';

const node = (id: string, kind: NodeKind): CanvasNode => ({ id, kind, label: `${kind}-${id}` });

const graph = (...nodes: CanvasNode[]): CanvasGraph => ({ nodes, edges: [] });

/** A paragraph that clears the shape gate — two real sentences, ample connectives. */
const PROSE =
  'The gateway authenticates every request before it reaches the order service. ' +
  'It also throttles abusive clients so that a burst cannot exhaust the pool.';

const narrative = (partial: Partial<DesignNarrative>): DesignNarrative => ({
  version: 1,
  componentRationales: [],
  flowNarrations: [],
  ...partial,
});

describe('readsAsProse', () => {
  it('accepts continuous prose with enough sentences and connectives', () => {
    expect(readsAsProse(PROSE)).toBe(true);
  });

  it('rejects a keyword dump — no sentences, no function words', () => {
    expect(readsAsProse('gateway cache database queue replica warehouse')).toBe(false);
  });

  it('rejects a single sentence, however long', () => {
    expect(
      readsAsProse('The gateway authenticates and throttles and routes and logs every request'),
    ).toBe(false);
  });

  it('rejects empty and whitespace-only text', () => {
    expect(readsAsProse('')).toBe(false);
    expect(readsAsProse('   \n  ')).toBe(false);
  });

  it('does not shred a decimal into two fragments (the revived bug)', () => {
    // "99.99%" used to split on the period, leaving two sub-six-word fragments
    // and failing an honest availability narrative.
    const withDecimal =
      'The replica keeps reads serving at 99.99% availability during a primary failover. ' +
      'It trails the primary by under a second so stale reads stay bounded.';
    expect(readsAsProse(withDecimal)).toBe(true);
  });
});

describe('narrationHasClaims', () => {
  it('is false for null and for an all-empty narrative', () => {
    expect(narrationHasClaims(null)).toBe(false);
    expect(narrationHasClaims(narrative({}))).toBe(false);
    expect(
      narrationHasClaims(
        narrative({ overview: '   ', componentRationales: [{ nodeId: 'a', prose: '' }] }),
      ),
    ).toBe(false);
  });

  it('is true when any slot carries text, even thin text', () => {
    expect(narrationHasClaims(narrative({ overview: 'x' }))).toBe(true);
    expect(
      narrationHasClaims(narrative({ componentRationales: [{ nodeId: 'a', prose: 'hi' }] })),
    ).toBe(true);
    expect(
      narrationHasClaims(narrative({ flowNarrations: [{ requirementIndex: 0, prose: 'hi' }] })),
    ).toBe(true);
  });
});

describe('projectNarration', () => {
  const g = graph(node('gw', 'api-gateway'), node('svc', 'service'));

  it('projects null to an all-absent fact set', () => {
    expect(projectNarration(null, g)).toEqual({
      present: false,
      overviewSubstantive: false,
      explainedNodeIds: [],
      narratedRequirementIndexes: [],
    });
  });

  it('counts only substantive slots and drops thin prose', () => {
    const facts = projectNarration(
      narrative({
        overview: PROSE,
        componentRationales: [
          { nodeId: 'gw', prose: PROSE },
          { nodeId: 'svc', prose: 'too short' },
        ],
        flowNarrations: [{ requirementIndex: 0, prose: PROSE }],
      }),
      g,
    );
    expect(facts.overviewSubstantive).toBe(true);
    expect(facts.explainedNodeIds).toEqual(['gw']);
    expect(facts.narratedRequirementIndexes).toEqual([0]);
    expect(facts.present).toBe(true);
  });

  it('drops a rationale for a node not on the graph (stale reference)', () => {
    const facts = projectNarration(
      narrative({ componentRationales: [{ nodeId: 'ghost', prose: PROSE }] }),
      g,
    );
    expect(facts.explainedNodeIds).toEqual([]);
    expect(facts.present).toBe(false);
  });

  it('sorts and de-duplicates the projected reference lists', () => {
    const facts = projectNarration(
      narrative({
        componentRationales: [
          { nodeId: 'svc', prose: PROSE },
          { nodeId: 'gw', prose: PROSE },
          { nodeId: 'gw', prose: PROSE },
        ],
        flowNarrations: [
          { requirementIndex: 2, prose: PROSE },
          { requirementIndex: 0, prose: PROSE },
        ],
      }),
      g,
    );
    expect(facts.explainedNodeIds).toEqual(['gw', 'svc']);
    expect(facts.narratedRequirementIndexes).toEqual([0, 2]);
  });

  it('treats an overview-only narrative as present', () => {
    const facts = projectNarration(narrative({ overview: PROSE }), g);
    expect(facts.present).toBe(true);
    expect(facts.explainedNodeIds).toEqual([]);
    expect(facts.narratedRequirementIndexes).toEqual([]);
  });
});
