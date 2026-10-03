import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../core/pipeline';
import { PIPELINES } from './index';

describe('the pipeline registry', () => {
  it('[QL-1] holds instances of the one definition, each valid, none sharing an id', () => {
    expect([...PIPELINES.keys()]).toEqual([
      'system-design',
      'agentic-design',
      'memory-recall',
      'experience-digest',
      'system-design-canvas',
      'design-prompt',
      'browser-step',
      'field-answer',
      'document-digest',
      'knowledge-digest',
    ]);
    for (const definition of PIPELINES.values()) {
      expect(() => validatePipeline(definition)).not.toThrow();
      expect(definition.id).toBe(PIPELINES.get(definition.id)?.id);
    }
  });

  it('[QL-62] [QL-46] every pipeline declares what a lost sample and a lost produce cost: a sample scores without gating, one produce is asked again', () => {
    for (const definition of PIPELINES.values()) {
      expect([definition.id, definition.policy.evidence.lostSample]).toEqual([
        definition.id,
        'score-only',
      ]);
      expect([definition.id, definition.policy.loop.lostProduces]).toEqual([definition.id, 1]);
      // What `GET /pipelines` and the dump carry says so too.
      expect(describePipeline(definition).policy).toMatchObject({
        evidence: { lostSample: 'score-only' },
        loop: { lostProduces: 1 },
      });
    }
  });
});
