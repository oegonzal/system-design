import { describe, expect, it } from 'vitest';

import {
  makeOrchestration,
  makeRunningOrchestration,
  makeTwoIterationRun,
} from '../../../testing/fixtures';
import { changesOf, countKinds, MAX_DEPTH, printPath } from './changes';
import { deriveOrchestration } from './derive-orchestration';
import { deriveRun } from './derive-run';
import { diffOf } from './differ';
import { reduce, reduceAll } from './reduce';
import { emptyState, type InspectorState } from './state';

/** The state before and after the action at `index` of a derived sequence. */
function pair(actions: ReturnType<typeof deriveRun>, index: number) {
  const before = reduceAll(emptyState(), actions.slice(0, index));
  const after = reduce(before, actions[index]);
  return { before, after };
}

const changesBetween = (before: InspectorState, after: InspectorState) =>
  changesOf(diffOf(before, after), before, after);

const paths = (changes: ReturnType<typeof changesOf>) => changes.map((change) => change.path);

describe('decoding a delta into addressed changes', () => {
  it('[QLU-7] a criterion that moved is one updated row, addressed by the criterion and not by an index', () => {
    const actions = deriveRun(makeTwoIterationRun());
    const second = actions.findIndex(
      (action) => action.type === 'ledger/normalised' && action.scope.iteration === 2,
    );
    const { before, after } = pair(actions, second);
    const changes = changesBetween(before, after);

    // Addressed by domain identity: the path still points at c2 however the
    // list is ordered, which an index-addressed path does not.
    const result = changes.find((change) => change.path === 'ledger.criteria[criterion:c2].result');
    expect(result).toMatchObject({ kind: 'updated', before: 'fail', after: 'pass' });
    expect(
      changes.find((change) => change.path === 'ledger.criteria[criterion:c2].confidence'),
    ).toMatchObject({ kind: 'updated', before: 'medium', after: 'high' });

    // The two findings are removed, each named by its own key.
    const removed = changes.filter((change) => change.kind === 'removed');
    expect(paths(removed).sort()).toEqual([
      'ledger.findings[finding:missing_requirement|component.2]',
      'ledger.findings[finding:unsupported_claim|summary]',
    ]);
    // Nothing about c1 changed, so nothing about c1 is reported.
    expect(paths(changes).some((path) => path.includes('criterion:c1'))).toBe(false);
  });

  it('[QLU-7] the delta and the engine’s own lessons agree about the same transition', () => {
    // The loop draws its own conclusions about what changed between iterations
    // and records them as lessons. When the diff and the engine disagree about
    // the same pair of ledgers, one of them is wrong — so this asserts they do
    // not: the delta names exactly the finding the loop called resolved and
    // exactly the criterion it called improved.
    const run = makeTwoIterationRun();
    const lessons = run.trace?.lessons ?? [];
    expect(lessons.map((lesson) => `${lesson.kind}:${lesson.subject}`)).toEqual([
      'resolved:unsupported_claim|summary',
      'improved:c2',
    ]);

    const actions = deriveRun(run);
    const ledgers = actions.filter((action) => action.type === 'ledger/normalised');
    const first = ledgers[0].type === 'ledger/normalised' ? ledgers[0].ledger : null;
    const next = ledgers[1].type === 'ledger/normalised' ? ledgers[1].ledger : null;
    const changes = changesOf(diffOf(first, next), first, next);

    const resolved = lessons.filter((lesson) => lesson.kind === 'resolved');
    for (const lesson of resolved) {
      expect(
        changes.find(
          (change) =>
            change.kind === 'removed' && change.path === `findings[finding:${lesson.subject}]`,
        ),
        `the diff should show ${lesson.subject} gone`,
      ).toBeDefined();
    }
    const improved = lessons.filter((lesson) => lesson.kind === 'improved');
    for (const lesson of improved) {
      expect(
        changes.find((change) => change.path === `criteria[criterion:${lesson.subject}].result`),
      ).toMatchObject({ kind: 'updated', before: 'fail', after: 'pass' });
    }
  });

  it('[QLU-7] a reordered list reads as a move, not as every element after it changing', () => {
    const before = {
      criteria: [
        { id: 'a', statement: 'A' },
        { id: 'b', statement: 'B' },
        { id: 'c', statement: 'C' },
      ],
    };
    const after = { criteria: [before.criteria[2], before.criteria[0], before.criteria[1]] };
    const changes = changesOf(diffOf(before, after), before, after);
    expect(countKinds(changes)).toEqual({ added: 0, removed: 0, updated: 0, moved: 1 });
    expect(changes[0]).toMatchObject({
      path: 'criteria[id:c]',
      kind: 'moved',
      fromIndex: 2,
      toIndex: 0,
    });
  });

  it('[QLU-7] an addition and a removal are distinguished, and carry only the side that exists', () => {
    const before = { lenses: { 'critic.a#s1': { hits: 1 } } };
    const after = { lenses: { 'critic.a#s1': { hits: 2 }, 'critic.b#s1': { hits: 1 } } };
    const changes = changesOf(diffOf(before, after), before, after);
    expect(changes).toEqual([
      {
        path: 'lenses.critic.a#s1.hits',
        segments: expect.any(Array),
        kind: 'updated',
        before: 1,
        after: 2,
        whole: false,
      },
      {
        path: 'lenses.critic.b#s1',
        segments: expect.any(Array),
        kind: 'added',
        after: { hits: 1 },
        whole: false,
      },
    ]);
    const back = changesOf(diffOf(after, before), after, before);
    const removed = back.find((change) => change.kind === 'removed');
    expect(removed?.before).toEqual({ hits: 1 });
    // A removal carries only the side that existed; there is no "after" to show.
    expect(removed === undefined ? true : 'after' in removed).toBe(false);
  });

  it('[QLU-7] a shape the client may not know is diffed by position, element by element', () => {
    // A pipeline's own artifact. Nothing in it has a name this client could
    // know, so elements match position to position — which keeps the diff to
    // the one that changed instead of reporting the whole list as replaced.
    const before = { artifact: { value: { nodes: [{ w: 1 }, { w: 2 }], edges: [] } } };
    const after = { artifact: { value: { nodes: [{ w: 1 }, { w: 9 }], edges: [] } } };
    const changes = changesOf(diffOf(before, after), before, after);
    expect(paths(changes)).toEqual(['artifact.value.nodes[1].w']);
    expect(changes[0]).toMatchObject({ kind: 'updated', before: 2, after: 9, whole: false });
  });

  it('[QLU-7] an element that does carry a key is identified by it, wherever it is found', () => {
    // The orchestrator's own report is another layer's shape, but its contested
    // findings carry the same structural key the ledger's do — so they are
    // addressed by that key rather than by a position that reordering changes.
    const settled = makeOrchestration();
    const earlier = makeOrchestration({
      steps: {
        ...settled.steps,
        reconcile: {
          ...settled.steps['reconcile'],
          report: {
            ...settled.steps['reconcile'].report,
            contested: {
              decision: true,
              findingTypes: ['missing_requirement'],
              findings: [
                {
                  key: 'missing_requirement|component.2',
                  type: 'missing_requirement',
                  seenBy: [0],
                },
              ],
            },
          },
        },
      },
    });
    const before = reduceAll(emptyState(), deriveOrchestration(earlier));
    const after = reduceAll(emptyState(), deriveOrchestration(settled));
    expect(paths(changesBetween(before, after))).toContain(
      'orchestration.steps.reconcile.report.contested.findings[finding:missing_requirement|component.2].seenBy[1]',
    );
  });

  it('[QLU-7] past the depth bound a subtree is reported whole rather than unaddressed', () => {
    const deep = (depth: number, leaf: unknown): unknown =>
      depth === 0 ? leaf : { down: deep(depth - 1, leaf) };
    const before = deep(MAX_DEPTH + 3, 'old');
    const after = deep(MAX_DEPTH + 3, 'new');
    const changes = changesOf(diffOf(before, after), before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0].whole).toBe(true);
    expect(changes[0].segments).toHaveLength(MAX_DEPTH);
  });

  it('[QLU-7] nothing changed is no changes at all', () => {
    const state = reduceAll(emptyState(), deriveRun(makeTwoIterationRun()));
    expect(changesBetween(state, state)).toEqual([]);
    expect(printPath([])).toBe('');
  });

  it('[QLU-7] the clock can be set aside, so a poll that only re-timed reads as quiet', () => {
    const before = reduceAll(emptyState(), deriveOrchestration(makeRunningOrchestration()));
    const reTimed: InspectorState = {
      ...before,
      orchestration:
        before.orchestration === null
          ? null
          : {
              ...before.orchestration,
              steps: {
                ...before.orchestration.steps,
                panel: {
                  ...before.orchestration.steps['panel'],
                  finishedAt: '2026-09-06T00:11:40.000Z',
                },
              },
            },
    };
    expect(changesBetween(before, reTimed)).toHaveLength(1);
    expect(changesOf(diffOf(before, reTimed, true), before, reTimed)).toEqual([]);
  });
});
