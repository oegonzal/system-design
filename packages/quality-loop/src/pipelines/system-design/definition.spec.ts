import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
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
