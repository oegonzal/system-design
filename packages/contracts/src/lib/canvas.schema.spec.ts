import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CANVAS_NODES_BOUND, CANVAS_MAX_TOTAL_OPERATIONS, NODE_CONFIG_KEYS_BOUND } from './canvas';
import { designSubmissionSchema, sessionDraftSchema, type DesignSubmission } from './canvas.schema';
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

/** The brief a fixture always carries — the part these cases break — or a failure that says it carried none. */
const briefOf = (submission: DesignSubmission) => {
  if (submission.brief === null) throw new Error('the fixture carries no brief');
  return submission.brief;
};

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
    briefOf(noNodes).bindings[0].nodeIds = [];
    expect(designSubmissionSchema.safeParse(noNodes).success).toBe(false);
    const noClaim = structuredClone(fixture);
    briefOf(noClaim).bindings[0].claim = '';
    expect(designSubmissionSchema.safeParse(noClaim).success).toBe(false);
  });

  it('[UX-23] accepts a trade-off on a binding and a rationale and a decisions list; a submission needs a decision’s choice, a draft does not', () => {
    const fixture = submissionFixture();
    if (fixture.brief === null || fixture.narrative === null)
      throw new Error('the fixture is whole');
    const defended = {
      ...fixture,
      brief: {
        ...fixture.brief,
        bindings: fixture.brief.bindings.map((binding, index) =>
          index === 0 ? { ...binding, tradeoff: 'a table rather than a cache' } : binding,
        ),
      },
      narrative: {
        ...fixture.narrative,
        componentRationales: fixture.narrative.componentRationales.map((rationale, index) =>
          index === 0 ? { ...rationale, tradeoff: 'a service of its own' } : rationale,
        ),
        decisions: [{ choice: 'Own a read model', alternative: 'Query live', cost: 'Staleness' }],
      },
    };
    expect(designSubmissionSchema.safeParse(defended).success).toBe(true);
    const undecided = {
      ...defended,
      narrative: { ...defended.narrative, decisions: [{ choice: '' }] },
    };
    expect(designSubmissionSchema.safeParse(undecided).success).toBe(false);
    expect(sessionDraftSchema.safeParse(undecided).success).toBe(true);
  });

  it('[UX-24] accepts a data model beside the diagram and entity refs on a binding; a submission needs an entity’s name, a draft does not, and a stored revision without a model still parses', () => {
    const fixture = submissionFixture();
    if (fixture.brief === null) throw new Error('the fixture is whole');
    const modelled = {
      ...fixture,
      model: {
        version: 1,
        entities: [
          {
            id: 'order',
            name: 'Order',
            ownerNodeId: fixture.graph.nodes[0].id,
            fields: [{ name: 'placedAt' }],
            invariants: ['Stored once.'],
            states: ['placed', 'fulfilled'],
          },
        ],
        relations: [],
      },
      brief: {
        ...fixture.brief,
        bindings: fixture.brief.bindings.map((binding, index) =>
          index === 0 ? { ...binding, entityIds: ['order'] } : binding,
        ),
      },
    };
    expect(designSubmissionSchema.safeParse(modelled).success).toBe(true);
    expect(designSubmissionSchema.safeParse(fixture).success).toBe(true);
    const unnamed = {
      ...modelled,
      model: { ...modelled.model, entities: [{ ...modelled.model.entities[0], name: '' }] },
    };
    expect(designSubmissionSchema.safeParse(unnamed).success).toBe(false);
    expect(sessionDraftSchema.safeParse(unnamed).success).toBe(true);
  });

  it('[QL-49] every bound the coach writes into sits above what it has measurably written', () => {
    // `measured/canvas.json`: every field the canvas coach wrote across the
    // recorded runs, refreshed by `pnpm measure:bounds`. A target under the
    // 99th percentile written would make most revisions overruns, and a
    // ceiling at or under the longest would keep it past the ceiling rather
    // than accept it — which a submit, held to the ceilings, then refuses.
    expect(measured.runs).toBeGreaterThan(0);
    // The trade-off slots and the decisions arrived with the canvas
    // pipeline's 2.0.0; no coach has written one yet. The exemptions go the
    // day `pnpm measure:bounds --pipeline=system-design-canvas` first finds them.
    const unwritten = 'added with the canvas pipeline’s 2.0.0; no coach has written one yet';
    // The transcript is composed by the studio from stored turns, never
    // written by a model; its bounds hold what the interviewer pipeline's
    // own schema allows a reply, and are measured where that is measured.
    const composed =
      'composed by the studio from interview turns; no interview has been graded yet';
    expect(
      boundsAgainstMeasured(designSubmissionSchema, measured.fields, {
        exempt: {
          'brief.bindings[].tradeoff': unwritten,
          'narrative.componentRationales[].tradeoff': unwritten,
          'narrative.decisions': unwritten,
          'narrative.decisions[].choice': unwritten,
          'narrative.decisions[].alternative': unwritten,
          'narrative.decisions[].cost': unwritten,
          'narrative.decisions[].reconsiderWhen': unwritten,
          'narrative.decisions[].nodeIds': unwritten,
          'narrative.decisions[].nodeIds[]': unwritten,
          'narrative.assumptions': unwritten,
          'narrative.assumptions[]': unwritten,
          'brief.bindings[].entityIds': unwritten,
          'brief.bindings[].entityIds[]': unwritten,
          'transcript.turns': composed,
          'transcript.turns[].phase': composed,
          'transcript.turns[].text': composed,
          'transcript.turns[].disclosesCriterionIds': composed,
          'transcript.turns[].disclosesCriterionIds[]': composed,
          'transcript.phases': composed,
          'transcript.phases[].id': composed,
          'model.entities': unwritten,
          'model.entities[].id': unwritten,
          'model.entities[].name': unwritten,
          'model.entities[].ownerNodeId': unwritten,
          'model.entities[].key': unwritten,
          'model.entities[].fields': unwritten,
          'model.entities[].fields[].name': unwritten,
          'model.entities[].fields[].note': unwritten,
          'model.entities[].invariants': unwritten,
          'model.entities[].invariants[]': unwritten,
          'model.entities[].states': unwritten,
          'model.entities[].states[]': unwritten,
          'model.relations': unwritten,
          'model.relations[].from': unwritten,
          'model.relations[].to': unwritten,
          'model.relations[].note': unwritten,
        },
      }),
    ).toEqual([]);
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
