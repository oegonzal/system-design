import { describe, expect, it } from 'vitest';

import { confirmed, evidence, ledger, tinyPolicy } from '../testing';
import { composeController, type Gate, type Route } from './compose';
import { acceptThreshold, artifact, byRemediations } from './gates';
import { STANDARD } from './index';

const alwaysPass = (factor: string): Gate => ({
  factor,
  check: () => ({ ok: true, detail: `${factor} passed` }),
});

const settleAs = (factor: string, decision: 'revise' | 'accept'): Route => ({
  factor,
  settle: () => ({ decision, reason: `${factor} settled` }),
});

const steps = (decision: ReturnType<typeof STANDARD.decide>) =>
  decision.trace.steps.map((step) => `${step.factor}:${step.outcome}`);

describe('composeController', () => {
  it('[QL-8] consults gates in declared order, records each, and skips the rest once one settles', () => {
    // A gate of a pipeline's own, refusing any artifact with a `gap` finding.
    const noGaps: Gate = {
      factor: 'no-gaps',
      params: { type: 'gap' },
      check: (ctx) => {
        const gaps = ctx.ledger.findings.filter((finding) => finding.type === 'gap');
        return gaps.length === 0
          ? { ok: true, detail: 'no gaps' }
          : { ok: false, decision: 'revise', reason: `${gaps.length} gap(s) to close` };
      },
    };
    const controller = composeController('strict', {
      gates: [artifact, noGaps, acceptThreshold],
      route: byRemediations,
    });
    expect(controller.summary).toEqual({
      id: 'strict',
      steps: [
        { factor: 'artifact' },
        { factor: 'no-gaps', params: { type: 'gap' } },
        { factor: 'accept-threshold' },
        { factor: 'route' },
      ],
    });

    const decision = controller.decide(
      ledger({ criteria: [evidence({})], findings: [confirmed({})] }),
      tinyPolicy(),
    );
    expect(decision.finalDecision).toBe('revise');
    expect(decision.reason).toBe('1 gap(s) to close');
    expect(steps(decision)).toEqual([
      'scores:computed',
      'artifact:passed',
      'no-gaps:decided',
      'accept-threshold:skipped',
      'route:skipped',
    ]);
  });

  it('[QL-8] the route settles when no gate does, and the facts are the engine’s under any composition', () => {
    const input = ledger({ criteria: [evidence({ result: 'fail' })] });
    const bare = composeController('bare', {
      gates: [alwaysPass('one'), alwaysPass('two')],
      route: settleAs('always-revise', 'revise'),
    });
    const decision = bare.decide(input, tinyPolicy());
    expect(decision.finalDecision).toBe('revise');
    expect(decision.reason).toBe('always-revise settled');
    expect(steps(decision)).toEqual([
      'scores:computed',
      'one:passed',
      'two:passed',
      'always-revise:decided',
    ]);
    const standard = STANDARD.decide(input, tinyPolicy());
    expect(decision.gates).toEqual(standard.gates);
    expect(decision.scores).toEqual(standard.scores);
    expect(decision.selectedRemediations).toEqual(standard.selectedRemediations);
  });

  it('[QL-1] refuses a composition with a duplicate factor, the engine’s factor, or no id', () => {
    expect(() =>
      composeController('twice', {
        gates: [alwaysPass('same'), alwaysPass('same')],
        route: byRemediations,
      }),
    ).toThrow(/factors must be unique/);
    expect(() =>
      composeController('taken', { gates: [alwaysPass('scores')], route: byRemediations }),
    ).toThrow(/scores is the engine's factor/);
    expect(() =>
      composeController('clash', { gates: [artifact], route: settleAs('artifact', 'accept') }),
    ).toThrow(/factors must be unique/);
    expect(() => composeController(' ', { gates: [], route: byRemediations })).toThrow(
      /non-empty id/,
    );
  });
});
