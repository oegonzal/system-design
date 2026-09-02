import { describe, expect, it } from 'vitest';

import type { CanvasGraph, NodeOperation, WorkflowSpec } from '@sysdesign/contracts';

import { validateWorkflowReferences } from './workflow-validator';

const spec: WorkflowSpec = {
  version: 1,
  entities: [],
  operations: [
    { id: 'op-c', kind: 'command', statement: 'do' },
    { id: 'op-q', kind: 'query', statement: 'read' },
  ],
  events: [{ id: 'evt-a', statement: 'happened' }],
  aggregations: [{ id: 'agg-1', statement: 'total', sourceEventIds: ['evt-a'] }],
  ingests: [{ id: 'ing-p', mode: 'push', statement: 'in', nfrId: 'n1', emits: ['evt-a'] }],
};

const graphWith = (operations: NodeOperation[], kind = 'service' as const): CanvasGraph => ({
  nodes: [{ id: 'n-1', kind, label: 'Node', operations }],
  edges: [],
});

describe('validateWorkflowReferences', () => {
  it('accepts claims that resolve — including a query serving an aggregation', () => {
    const problems = validateWorkflowReferences(
      graphWith([
        { name: 'do', kind: 'command', fulfills: 'op-c', emits: ['evt-a'] },
        { name: 'total', kind: 'query', fulfills: 'agg-1' },
      ]),
      spec,
    );
    expect(problems).toEqual([]);
  });

  it('[PRD-2] rejects ids the prompt never declared — the editor offers only spec ids, so a stranger is hand-crafted', () => {
    const problems = validateWorkflowReferences(
      graphWith([{ name: 'do', kind: 'command', fulfills: 'op-ghost', emits: ['evt-ghost'] }]),
      spec,
    );
    expect(problems).toEqual([
      expect.stringContaining('unknown workflow item: op-ghost'),
      expect.stringContaining('unknown workflow event: evt-ghost'),
    ]);
  });

  it('rejects any workflow claim on a prompt with no spec', () => {
    const problems = validateWorkflowReferences(
      graphWith([{ name: 'do', kind: 'command', fulfills: 'op-c', emits: ['evt-a'] }]),
      null,
    );
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain('no workflow spec');
  });

  it('rejects one node fulfilling the same item twice, but leaves cross-node contention to the grade', () => {
    const doubled = validateWorkflowReferences(
      graphWith([
        { name: 'a', kind: 'command', fulfills: 'op-c' },
        { name: 'b', kind: 'command', fulfills: 'op-c' },
      ]),
      spec,
    );
    expect(doubled).toEqual([expect.stringContaining("fulfils 'op-c' twice")]);

    const contended = validateWorkflowReferences(
      {
        nodes: [
          {
            id: 'n-1',
            kind: 'service',
            label: 'A',
            operations: [{ name: 'a', kind: 'command', fulfills: 'op-c' }],
          },
          {
            id: 'n-2',
            kind: 'service',
            label: 'B',
            operations: [{ name: 'b', kind: 'command', fulfills: 'op-c' }],
          },
        ],
        edges: [],
      },
      spec,
    );
    expect(contended).toEqual([]);
  });

  it('rejects emissions from a non-api role, but grades — never rejects — a kind mismatch or a query that emits', () => {
    const channelEmits = validateWorkflowReferences(
      {
        nodes: [
          {
            id: 'n-1',
            kind: 'queue',
            label: 'Q',
            operations: [{ name: 'MsgT', kind: 'command', emits: ['evt-a'] }],
          },
        ],
        edges: [],
      },
      spec,
    );
    expect(channelEmits).toEqual([expect.stringContaining('cannot emit events')]);

    // Deliberately NOT problems: the evaluation owns these lessons.
    const graded = validateWorkflowReferences(
      graphWith([
        { name: 'posing', kind: 'query', fulfills: 'op-c' }, // kind mismatch
        { name: 'chatty', kind: 'query', emits: ['evt-a'] }, // query that emits
      ]),
      spec,
    );
    expect(graded).toEqual([]);
  });
});
