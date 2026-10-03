import type { EvidenceLedger } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { STANDARD } from '../../core/controllers';
import { confirmed, evidence, ledger, tinyPolicy } from '../../core/testing';
import { HAND_BACK } from './controller';

const policy = tinyPolicy();

const passing = (): EvidenceLedger => ledger({ criteria: [evidence({ result: 'pass' })] });

/** Every ledger that makes the standard controller answer something other than accept. */
const handedBack = (): Record<string, EvidenceLedger> => ({
  'a validator block (standard: retry)': ledger({
    validation: [
      {
        validatorId: 'references',
        gate: 'block',
        problems: [{ severity: 'critical', locationRefs: ['action.1'], message: 'e9 unknown' }],
      },
    ],
  }),
  'a blocker wanting a fresh attempt (standard: retry)': ledger({
    criteria: [evidence({ result: 'fail' })],
    findings: [confirmed({ key: 'gap|text', severity: 'critical', fixability: 'requires_retry' })],
  }),
  'a blocker to fix in place (standard: revise)': ledger({
    criteria: [evidence({ result: 'fail' })],
    findings: [confirmed({ key: 'gap|text', severity: 'critical', fixability: 'fixable_local' })],
  }),
  'an unfixable blocker (standard: reject)': ledger({
    criteria: [evidence({ result: 'fail' })],
    findings: [confirmed({ key: 'gap|text', severity: 'critical', fixability: 'unfixable' })],
  }),
  'a score under the floor (standard: retry)': ledger({
    criteria: [evidence({ result: 'fail' })],
    findings: [
      confirmed({ key: 'gap|text', severity: 'high', fixability: 'requires_retry' }),
      confirmed({
        key: 'gap|part.1',
        severity: 'high',
        fixability: 'requires_retry',
        locationRefs: ['part.1'],
      }),
    ],
  }),
  'a shortfall with remediations (standard: revise)': ledger({
    criteria: [evidence({ result: 'partial' })],
  }),
  'a shortfall with nothing to act on (standard: escalate)': ledger({
    criteria: [evidence({ result: 'pass' }), evidence({ criterionId: 'c2', result: 'unassessed' })],
  }),
});

describe('the browser-step controller', () => {
  it('[QL-36] accepts exactly where the standard controller accepts, over the same gates in the same order', () => {
    expect(HAND_BACK.id).toBe('hand-back');
    expect(STANDARD.decide(passing(), policy).finalDecision).toBe('accept');
    const decided = HAND_BACK.decide(passing(), policy);
    expect(decided.finalDecision).toBe('accept');
    expect(decided.reason).toBe(STANDARD.decide(passing(), policy).reason);
    expect(HAND_BACK.summary.steps.map((step) => step.factor)).toEqual(
      STANDARD.summary.steps.map((step) => step.factor),
    );
  });

  it('[QL-36] never yields retry, revise or reject: every non-accept is handed back as escalate, with what the gate decided on kept', () => {
    for (const [name, ledgerIn] of Object.entries(handedBack())) {
      const standard = STANDARD.decide(ledgerIn, policy);
      expect(standard.finalDecision, name).not.toBe('accept');
      const decided = HAND_BACK.decide(ledgerIn, policy);
      expect(decided.finalDecision, name).toBe('escalate');
      if (standard.finalDecision !== 'escalate') {
        expect(decided.reason, name).toContain('handed back');
      }
      // The decision is read as escalate; the gate that settled, and the facts it settled on, are unchanged.
      const settled = (trace: typeof decided.trace) =>
        trace.steps.find((step) => step.outcome === 'decided');
      expect(settled(decided.trace)?.factor, name).toBe(settled(standard.trace)?.factor);
      expect(settled(decided.trace)?.facts, name).toEqual(settled(standard.trace)?.facts);
      expect(decided.gates, name).toEqual(standard.gates);
      expect(decided.scores, name).toEqual(standard.scores);
    }
  });
});
