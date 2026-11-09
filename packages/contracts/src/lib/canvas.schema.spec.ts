import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CANVAS_NODES_BOUND, EDGE_CONFIG_HINTS, NODE_CONFIG_KEYS_BOUND } from './canvas';
import { canvasChangeSchema } from './canvas-change.schema';
import {
  CANVAS_RULES,
  designSubmissionSchema,
  sessionDraftSchema,
  type DesignSubmission,
} from './canvas.schema';
import { boundsAgainstMeasured, declaredSizes } from './measured-bounds';
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
        { id: 'n-4', kind: 'queue', service: 'aws.sqs', label: 'Order events' },
      ],
      edges: [
        { id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync', carries: ['placeOrder'] },
        { id: 'e-2', source: 'n-2', target: 'n-3', kind: 'sync', label: 'writes' },
        {
          id: 'e-3',
          source: 'n-2',
          target: 'n-4',
          kind: 'async',
          config: [
            { key: 'delivery', value: 'at-least-once' },
            { key: 'dlq', value: true },
          ],
        },
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

  it('rejects an unknown node kind, an unknown service, an unknown key, and a nested config value', () => {
    const fixture = submissionFixture();
    const badKind = structuredClone(fixture);
    (badKind.graph.nodes[0] as { kind: string }).kind = 'mainframe';
    expect(designSubmissionSchema.safeParse(badKind).success).toBe(false);

    // A service is an id the catalogue lists, exactly as a kind is — a wrong one is a structural fault.
    const badService = structuredClone(fixture);
    (badService.graph.nodes[3] as { service: string }).service = 'aws.mainframe';
    expect(designSubmissionSchema.safeParse(badService).success).toBe(false);

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
    // recorded runs — the 3 redraws of 2026-11-06T22:33:26Z…2026-11-07T00:32:46Z,
    // the first after the coach's effort was capped (66ff7ea8) — refreshed by
    // `pnpm measure:bounds --pipeline=system-design-canvas --since=…`. A target
    // under the 99th percentile written would make most revisions overruns,
    // and a ceiling at or under the longest would keep it past the ceiling
    // rather than accept it — which a submit, held to the ceilings, then refuses.
    expect(measured.runs).toBeGreaterThan(0);
    // A block's responsibilities are the author's editor's to write: no coach
    // redraw in the window wrote one (0 of 214 nodes — the coach states a
    // block's role as its operations and config). Held the day a coach writes one.
    const authored =
      'written by the author’s editor; no coach redraw in the window wrote one (0 of 214 nodes)';
    // The transcript is composed by the studio from stored turns, never
    // written by a model; its bounds hold what the interviewer pipeline's
    // own schema allows a reply, and are measured where that is measured.
    const composed =
      'composed by the studio from interview turns; no interview has been graded yet';
    // The change set is measured beside the submission — the same coach writes
    // both, the submission whole and the change set on a revise — and its
    // roots are its own, so no path is declared twice. The fixture predates
    // the change set, so every `changes.*` path it does not measure is held
    // to nothing; a path is held from the day the fixture measures it, with
    // no edit here. The whole-artifact paths stay measured only while chain
    // 4's redraws are in the window: a re-measure over change-set runs alone
    // would leave them unmeasured, so the next window must hold both.
    const unrecorded =
      'no change set is measured in the fixture yet — the first change-set rounds ran 2026-11-08 (arm C, lane run 2026-11-08T22-48-49-342-e4eb2d) and are not in `measured/canvas.json`; this exemption is derived from the paths the fixture lacks, so each path is held automatically the day the fixture measures it, with no edit here';
    const unmeasuredChangePaths = Object.keys(declaredSizes(canvasChangeSchema)).filter(
      (path) => !Object.hasOwn(measured.fields, path),
    );
    expect(unmeasuredChangePaths.every((path) => path.startsWith('changes.'))).toBe(true);
    // The index-addressed lists (2026-11-08) joined the schema under the same
    // derivation: their paths are exempt from the day they were declared.
    expect(unmeasuredChangePaths).toEqual(
      expect.arrayContaining([
        'changes.decisions.upsertAt',
        'changes.decisions.upsertAt[].decision.choice',
        'changes.decisions.removeAt',
        'changes.decisions.append',
        'changes.assumptions.upsertAt[].text',
        'changes.assumptions.append[]',
      ]),
    );
    expect(
      boundsAgainstMeasured([designSubmissionSchema, canvasChangeSchema], measured.fields, {
        exempt: {
          ...Object.fromEntries(unmeasuredChangePaths.map((path) => [path, unrecorded])),
          'graph.nodes[].responsibilities': authored,
          'graph.nodes[].responsibilities[]': authored,
          'transcript.turns': composed,
          'transcript.turns[].phase': composed,
          'transcript.turns[].text': composed,
          'transcript.turns[].disclosesCriterionIds': composed,
          'transcript.turns[].disclosesCriterionIds[]': composed,
          'transcript.phases': composed,
          'transcript.phases[].id': composed,
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
  it('tells the coach, in the JSON Schema itself, every rule that would void its revision — in the submission it writes whole and in the change set it writes on a revise', () => {
    const schemas = {
      submission: JSON.stringify(z.toJSONSchema(designSubmissionSchema)),
      'change set': JSON.stringify(z.toJSONSchema(canvasChangeSchema)),
    };
    // The list rules said once in CANVAS_RULES, and the element rules both
    // schemas carry because they share the element schemas.
    const shared = [
      ...Object.values(CANVAS_RULES),
      'One entry per key; a key set twice is refused.',
      'A name must be unique on the node',
      'each declared on its source or its target, and none repeated',
      // A node's service and a connection's config, since 2.1.0.
      'its kind must be one of the roles that section states for the service',
      `Suggested keys: ${EDGE_CONFIG_HINTS.join(', ')} — any key is accepted.`,
      // The rules that were already stated, kept here so one list is the record.
      "The author's id; keep it.",
      'One connected walk of existing edge ids',
    ];
    for (const [name, json] of Object.entries(schemas)) {
      for (const rule of shared) {
        expect(json, `the ${name} never tells the coach: ${rule}`).toContain(rule);
      }
    }
    // The change set's own: what a change leaves alone, what goes with a
    // removal, which of two entries for one key stands, what a replaced
    // list must carry — and, since the first change-set rounds (2026-11-08),
    // how an element is addressed, what the applied graph does with a
    // reference slip, and how a decision is changed by its position.
    for (const rule of [
      'Everything you do not name stays exactly as it is.',
      'every edge touching a removed node goes with it',
      'a later entry for the same criterion wins',
      'include every one you keep',
      "Address a node by the author's id (n-3, ai-…) or by the position the artifact above shows ([node.14] means the 14th node); a new node must carry a new id starting with ai-.",
      "Address an edge by the author's id (e-3, ai-…) or by the position the artifact above shows ([edge.14] means the 14th edge); a new edge must carry a new id starting with ai-.",
      'An edge whose endpoint does not exist, or a carried operation no endpoint declares, is dropped; so is an edge joining a node to itself. A new edge that repeats an existing source → target of the same kind replaces that edge and keeps its id, unless this change set removes that edge; an existing edge you rewire by its own id stays its own edge, even beside one it then repeats.',
      'Change one decision by its position; untouched decisions stay exactly as they are. Only replace what a remediation names.',
      'Change one assumption by its position; untouched assumptions stay exactly as they are. Only replace what a remediation names.',
      'The 1-based position in the artifact above: [decision.N] is N.',
    ]) {
      expect(schemas['change set'], `the change set never tells the coach: ${rule}`).toContain(
        rule,
      );
    }
  });
});
