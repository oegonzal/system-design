import { describe, expect, it } from 'vitest';

import { modelSchema, parseLenient, walkJsonSchema } from './bounds';
import type { CriterionRef } from './brief-validator';
import { applyCanvasChange } from './canvas-change';
import {
  bareSubmission,
  bestSubmission,
  changeOf,
  idsOf,
  wholeChange,
} from './canvas-change-fixtures';
import { canvasChangeSchema } from './canvas-change.schema';
import { designSubmissionSchema, type DesignSubmission } from './canvas.schema';
import { repairSubmission } from './submission-repair';

const criteria: CriterionRef[] = [{ id: 'c1' }, { id: 'c2' }];

/** The best with its decisions replaced by bare choices, so a position reads as its choice. */
function decided(choices: readonly string[]): DesignSubmission {
  const base = bestSubmission();
  if (base.narrative === null) throw new Error('the fixture carries a narrative');
  return {
    ...base,
    narrative: { ...base.narrative, decisions: choices.map((choice) => ({ choice })) },
  };
}
const choicesOf = (submission: DesignSubmission): string[] | undefined =>
  submission.narrative?.decisions?.map((decision) => decision.choice);

describe('canvasChangeSchema', () => {
  it('[QL-84] accepts a change set naming every part and infers the same object back', () => {
    const whole = wholeChange();
    expect(canvasChangeSchema.parse(whole)).toEqual(whole);
    expect(canvasChangeSchema.parse(changeOf({}))).toEqual(changeOf({}));
  });

  it('[QL-84] a whole submission does not parse as a change set and a change set does not parse as a submission, strictly or leniently', () => {
    // The loop's fake model answers with the first canned object that parses
    // leniently, unknown keys stripped: without the one required root key a
    // submission would read as an empty change.
    expect(canvasChangeSchema.safeParse(bestSubmission()).success).toBe(false);
    expect(parseLenient(canvasChangeSchema, bestSubmission()).ok).toBe(false);
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

  it('[QL-84] a position is an integer the reply is never refused over: no minimum, so a 0 is a position the apply ignores', () => {
    const parsed = canvasChangeSchema.safeParse(
      changeOf({
        decisions: { upsertAt: [{ at: 0, decision: { choice: 'x' } }], removeAt: [0], append: [] },
      }),
    );
    expect(parsed.success).toBe(true);
    expect(
      canvasChangeSchema.safeParse(
        changeOf({ decisions: { upsertAt: [], removeAt: [1.5], append: [] } }),
      ).success,
    ).toBe(false);
  });
});

describe('applyCanvasChange', () => {
  it('[QL-84] a change naming nothing returns the best, equal by value', () => {
    expect(applyCanvasChange(bestSubmission(), changeOf({}))).toEqual(bestSubmission());
    expect(applyCanvasChange(bareSubmission(), changeOf({}))).toEqual(bareSubmission());
  });

  it('[QL-84] a later upsert for the same key wins, and is appended once', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        nodes: {
          upsert: [
            { id: 'ai-x', kind: 'cache', label: 'first' },
            { id: 'ai-x', kind: 'cache', label: 'second' },
          ],
          remove: [],
        },
      }),
    );
    expect(idsOf(applied.graph.nodes)).toEqual(['n-1', 'n-2', 'n-3', 'ai-x']);
    expect(applied.graph.nodes[3].label).toBe('second');
  });

  it('[QL-84] removes by key, and a removal naming nothing is a no-op', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        nodes: { upsert: [], remove: ['n-9'] },
        edges: { upsert: [], remove: ['e-2', 'e-9'] },
        entities: { upsert: [], remove: ['nothing'] },
        bindings: { upsert: [], remove: ['c9'] },
      }),
    );
    expect(applied.graph.nodes).toEqual(bestSubmission().graph.nodes);
    expect(idsOf(applied.graph.edges)).toEqual(['e-1']);
    expect(applied.model).toEqual(bestSubmission().model);
    expect(applied.brief).toEqual(bestSubmission().brief);
  });

  it('[QL-84] a container appears only when the change touches it, with its version literal', () => {
    const binding = { criterionId: 'c1', nodeIds: ['n-2'], claim: 'bound' };
    const briefed = applyCanvasChange(
      bareSubmission(),
      changeOf({ bindings: { upsert: [binding], remove: [] } }),
    );
    expect(briefed.brief).toEqual({ version: 1, bindings: [binding] });
    expect(briefed.narrative).toBeNull();
    expect('model' in briefed).toBe(false);

    const explained = applyCanvasChange(bareSubmission(), changeOf({ overview: 'Now explained.' }));
    expect(explained.narrative).toEqual({
      version: 1,
      overview: 'Now explained.',
      componentRationales: [],
      criterionNarrations: [],
    });
    expect(explained.brief).toBeNull();

    const decided = applyCanvasChange(
      bareSubmission(),
      changeOf({ decisions: { upsertAt: [], removeAt: [], append: [{ choice: 'First.' }] } }),
    );
    expect(decided.narrative?.decisions).toEqual([{ choice: 'First.' }]);

    const entity = { id: 'order', name: 'Order', fields: [], invariants: [], states: [] };
    const modelled = applyCanvasChange(
      bareSubmission(),
      changeOf({ entities: { upsert: [entity], remove: [] } }),
    );
    expect(modelled.model).toEqual({ version: 1, entities: [entity], relations: [] });

    // A model the best carries as null stays null exactly when nothing touches it.
    const nulled = applyCanvasChange(
      { ...bareSubmission(), model: null },
      changeOf({ overview: 'x' }),
    );
    expect(nulled.model).toBeNull();
  });

  it('[QL-84] decisions are edited by the best’s positions: an upsert rewrites in place and a later one wins, removals read the best’s numbering whatever their order, an unknown position is ignored, appends follow', () => {
    const edited = (removeAt: number[]) =>
      choicesOf(
        applyCanvasChange(
          decided(['a', 'b', 'c']),
          changeOf({
            decisions: {
              upsertAt: [
                { at: 2, decision: { choice: 'b2' } },
                { at: 2, decision: { choice: 'b3' } },
                { at: 9, decision: { choice: 'past the end' } },
              ],
              removeAt,
              append: [{ choice: 'd' }],
            },
          }),
        ),
      );
    expect(edited([1, 3, 9])).toEqual(['b3', 'd']);
    expect(edited([3, 1])).toEqual(['b3', 'd']);
    expect(edited([])).toEqual(['a', 'b3', 'c', 'd']);
  });

  it('[QL-84] a position both rewritten and removed is removed: removals apply after upserts; a list edited down to nothing goes; one not named stays word for word', () => {
    const removed = applyCanvasChange(
      decided(['a', 'b']),
      changeOf({
        decisions: { upsertAt: [{ at: 1, decision: { choice: 'a2' } }], removeAt: [1], append: [] },
      }),
    );
    expect(choicesOf(removed)).toEqual(['b']);

    const emptied = applyCanvasChange(
      decided(['a']),
      changeOf({ decisions: { upsertAt: [], removeAt: [1], append: [] } }),
    ).narrative;
    expect(emptied !== null && 'decisions' in emptied).toBe(false);

    const untouched = applyCanvasChange(bestSubmission(), changeOf({ overview: 'Rewritten.' }));
    expect(untouched.narrative?.decisions).toEqual(bestSubmission().narrative?.decisions);
    expect(untouched.narrative?.assumptions).toEqual(bestSubmission().narrative?.assumptions);
  });

  it('[QL-84] assumptions follow the same algebra, by text', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
        assumptions: {
          upsertAt: [{ at: 1, text: 'Orders fit one region, for now.' }],
          removeAt: [7],
          append: ['Reads outnumber writes.'],
        },
      }),
    );
    expect(applied.narrative?.assumptions).toEqual([
      'Orders fit one region, for now.',
      'Reads outnumber writes.',
    ]);
    const cleared = applyCanvasChange(
      bestSubmission(),
      changeOf({ assumptions: { upsertAt: [], removeAt: [1], append: [] } }),
    ).narrative;
    expect(cleared !== null && 'assumptions' in cleared).toBe(false);
  });

  it('[QL-84] relations, which the render numbers nowhere, are replaced whole when named, an empty list removing them all, and left alone when not', () => {
    const replaced = applyCanvasChange(bestSubmission(), changeOf({ relations: { replace: [] } }));
    expect(replaced.model?.relations).toEqual([]);
    expect(replaced.model?.entities).toEqual(bestSubmission().model?.entities);
    const kept = applyCanvasChange(bestSubmission(), changeOf({ overview: 'x' }));
    expect(kept.model?.relations).toEqual(bestSubmission().model?.relations);
  });

  it('[QL-84] the overview is set when named, cleared by an empty string, and kept when not named', () => {
    expect(
      applyCanvasChange(bestSubmission(), changeOf({ overview: 'Rewritten.' })).narrative?.overview,
    ).toBe('Rewritten.');
    const cleared = applyCanvasChange(bestSubmission(), changeOf({ overview: '' })).narrative;
    expect(cleared !== null && 'overview' in cleared).toBe(false);
    const kept = applyCanvasChange(
      bestSubmission(),
      changeOf({ assumptions: { upsertAt: [], removeAt: [], append: ['Kept.'] } }),
    );
    expect(kept.narrative?.overview).toBe(bestSubmission().narrative?.overview);
  });

  it('[QL-84] bindings and narrations are keyed by criterion, rationales by node: replaced in place, a later entry winning, removed by key', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
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

  it('[QL-84] leaves what a removal left dangling outside the graph for repairSubmission, which drops it as it drops the editor’s', () => {
    const applied = applyCanvasChange(
      bestSubmission(),
      changeOf({
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
    expect(applied.model?.relations).toEqual(bestSubmission().model?.relations);
    // Repaired: the path stops where e-2 was, the binding with no node left goes, so do the rest.
    const repaired = repairSubmission(applied, criteria);
    expect(repaired.brief?.bindings).toEqual([
      { criterionId: 'c1', nodeIds: ['n-2'], path: ['e-1'], claim: 'the API writes' },
    ]);
    expect(repaired.narrative?.componentRationales.map((item) => item.nodeId)).toEqual(['n-2']);
    expect(repaired.model?.relations).toEqual([]);
  });

  it('[QL-84] copies the transcript from the best, and carries none when the best has none', () => {
    expect(applyCanvasChange(bestSubmission(), wholeChange()).transcript).toEqual(
      bestSubmission().transcript,
    );
    expect('transcript' in applyCanvasChange(bareSubmission(), wholeChange())).toBe(false);
  });

  it('[QL-84] the applied result is a submission, and apply then repairSubmission is idempotent on it', () => {
    const applied = applyCanvasChange(bestSubmission(), wholeChange());
    expect(designSubmissionSchema.parse(applied)).toEqual(applied);
    expect(idsOf(applied.graph.nodes)).toEqual(['n-2', 'n-3', 'ai-cache']);
    expect(idsOf(applied.graph.edges)).toEqual(['e-2', 'ai-e-1']);
    expect(choicesOf(applied)).toEqual(['One store, cached', 'Cache the reads']);
    const once = repairSubmission(applied, criteria);
    expect(repairSubmission(once, criteria)).toEqual(once);
  });
});
