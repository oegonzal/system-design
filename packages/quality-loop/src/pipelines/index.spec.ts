import { describe, expect, it } from 'vitest';

import { validatePipeline } from '../core/pipeline';
import { PIPELINES } from './index';

describe('the pipeline registry', () => {
  it('[QL-1] holds instances of the one definition, each valid, none sharing an id', () => {
    expect([...PIPELINES.keys()]).toEqual([
      'system-design',
      'agentic-design',
      'memory-recall',
      'experience-digest',
      'system-design-canvas',
    ]);
    for (const definition of PIPELINES.values()) {
      expect(() => validatePipeline(definition)).not.toThrow();
      expect(definition.id).toBe(PIPELINES.get(definition.id)?.id);
    }
  });
});
