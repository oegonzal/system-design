import type { RemediationNote } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { confirmed, evidence, ledger, traceOf } from '../../../core/testing';
import type { RecallBase } from '../../../modules/runs/recall/run-recall';
import { KNOWN_LINE_MAX, MAX_KNOWN } from '../../../pipelines/memory-recall/input';
import { knownLines, knownOf } from './known';

const note = (
  subject: RemediationNote['subject'],
  text: string,
  severity: RemediationNote['severity'] = 'high',
): RemediationNote => ({ subject, action: 'revise', severity, targetRefs: [], note: text });

/** A judged base: one confirmed finding, one partial criterion, and the notes its producer is handed. */
const base = (remediations: RemediationNote[]): RecallBase => {
  const [iteration] = traceOf({
    ledger: ledger({
      findings: [confirmed({ key: 'unhandled_failure|node.3', type: 'unhandled_failure' })],
      criteria: [evidence({ criterionId: 'c2', result: 'partial' })],
    }),
  }).iterations;
  return {
    runId: 'grade',
    pipeline: 'system-design-canvas',
    iteration: { ...iteration, remediations },
    criteria: [],
    adoptedFrom: null,
  };
};

describe('what the producer a recall is for already holds', () => {
  it('[QL-51] is the base ledger’s finding keys and criterion results, its chain and goal, and every note it is handed', () => {
    const known = knownOf(
      base([
        note(
          { finding: 'unhandled_failure|node.3' },
          'Say what serves reads while the cache is down.',
        ),
        note({ criterion: 'c2' }, 'Order the list newest first.', 'medium'),
        note({ validator: 'references' }, 'Bind every claim to a component.', 'low'),
        note({ schema: 'brief.bindings[2].claim' }, 'Write the claim.', 'critical'),
      ]),
      [{ runId: 'grade', iteration: 1 }],
      'goal-hash',
    );
    expect(known.pipeline).toBe('system-design-canvas');
    expect(known.goalHash).toBe('goal-hash');
    expect(known.chain).toEqual([{ runId: 'grade', iteration: 1 }]);
    expect([...known.findings]).toEqual(['unhandled_failure|node.3']);
    expect([...known.criteria]).toEqual([['c2', 'partial']]);
    // A finding in words by its type, looked up by key; a criterion with its result; ids as they are.
    expect(known.remediations.map((remediation) => remediation.subject)).toEqual([
      'unhandled failure',
      'c2 partial',
      'references',
      'brief.bindings[2].claim',
    ]);
    expect(knownLines(known)).toEqual([
      'high · unhandled failure: Say what serves reads while the cache is down.',
      'medium · c2 partial: Order the list newest first.',
      'low · references: Bind every claim to a component.',
      'critical · brief.bindings[2].claim: Write the claim.',
    ]);
  });

  it('[QL-51] the curator is shown the first notes the producer reads, each capped as a probe is', () => {
    const many = Array.from({ length: MAX_KNOWN + 5 }, (_, index) =>
      note({ finding: 'unhandled_failure|node.3' }, `${index} ${'x'.repeat(600)}`),
    );
    const lines = knownLines(knownOf(base(many), [{ runId: 'grade', iteration: 1 }], 'h'));
    expect(lines).toHaveLength(MAX_KNOWN);
    expect(lines[0].startsWith('high · unhandled failure: 0 ')).toBe(true);
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(KNOWN_LINE_MAX);
  });
});
