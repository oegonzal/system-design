import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { boundsBelowMeasured, capsBelowMeasured, declaredCaps } from '../../core/testing';
import { SYSTEM_DESIGN } from './definition';
import { designAnswerOutput, type DesignAnswer } from './output';

const answer: DesignAnswer = {
  summary: 'A read-optimised history service.',
  assumptions: ['orders are immutable once placed'],
  components: [
    { name: 'History API', responsibility: 'serves the list', technology: 'Node' },
    { name: 'Order store', responsibility: 'holds merged orders', technology: null },
  ],
  flows: [{ name: 'view history', steps: ['History API', 'Order store'] }],
  dataModel: ['order(id, customerId, placedAt)'],
  tradeoffs: [{ decision: 'poll the POS', rationale: 'it sends nothing', alternative: null }],
  risks: [{ risk: 'POS outage', mitigation: 'serve the last snapshot' }],
  capacity: [{ metric: 'reads/s', estimate: '150' }],
};

describe('the system-design pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(SYSTEM_DESIGN as never)).not.toThrow();
    const summary = describePipeline(SYSTEM_DESIGN as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...SYSTEM_DESIGN.critics, ...SYSTEM_DESIGN.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(SYSTEM_DESIGN.producer.persona).toContain('system-design');
  });

  it('[QL-4] every prose bound the producer is shown sits above the longest it has measurably written', () => {
    // The longest each path has been written across the recorded runs
    // (static/runs, to 2026-10-01). A string past its bound is a miss that
    // discards the whole answer — never cut to fit — so no bound may be one
    // the producer meets.
    const measured: Record<string, number> = {
      summary: 1032,
      'assumptions[]': 180,
      'components[].name': 41,
      'components[].responsibility': 360,
      'components[].technology': 95,
      'flows[].name': 97,
      'flows[].steps[]': 358,
      'dataModel[]': 438,
      'tradeoffs[].decision': 167,
      'tradeoffs[].rationale': 457,
      'tradeoffs[].alternative': 226,
      'risks[].risk': 159,
      'risks[].mitigation': 364,
      'capacity[].metric': 50,
      'capacity[].estimate': 279,
    };
    expect(boundsBelowMeasured(designAnswerOutput.schema, measured)).toEqual([]);
  });

  it('[QL-33] every declared output cap is above what its stage has measurably written', () => {
    // The most output tokens, thinking included, each stage wrote across the
    // recorded system-design runs (static/runs, 2026-09-06 – 2026-09-30). A
    // cap is also the call's time limit, so one a stage outwrites is a call
    // cut short.
    const measured: Record<string, number> = {
      criteria: 1_377,
      producer: 15_746,
      'critic.requirements': 7_773,
      'critic.soundness': 11_244,
      'critic.scale': 8_692,
      'evaluator.requirements': 1_547,
      'evaluator.quality': 2_730,
    };
    expect(capsBelowMeasured(SYSTEM_DESIGN, measured)).toEqual([]);
    // With a fifth of headroom over each, so the next longer answer is not the one cut.
    const withHeadroom = Object.fromEntries(
      Object.entries(measured).map(([stage, most]) => [stage, Math.ceil(most * 1.2)]),
    );
    expect(capsBelowMeasured(SYSTEM_DESIGN, withHeadroom)).toEqual([]);
    expect(Object.keys(declaredCaps(SYSTEM_DESIGN)).sort()).toEqual(Object.keys(measured).sort());
  });

  it('[QL-4] every location the answer exposes is printed verbatim where a judge reads it', () => {
    const rendered = designAnswerOutput.render(answer);
    for (const location of designAnswerOutput.locate(answer)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    expect(designAnswerOutput.locate(answer).map((location) => location.id)).toEqual([
      'summary',
      'assumption.1',
      'component.1',
      'component.2',
      'flow.1',
      'data.1',
      'tradeoff.1',
      'risk.1',
      'capacity.1',
    ]);
    expect(designAnswerOutput.schema.safeParse(answer).success).toBe(true);
  });
});
