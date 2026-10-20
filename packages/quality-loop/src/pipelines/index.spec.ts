import { describe, expect, it } from 'vitest';

import { describePipeline } from '../core/describe-pipeline';
import { validatePipeline } from '../core/validate-pipeline';
import { type PipelineDefinition } from '../core/pipeline';
import { PIPELINES } from './index';

/**
 * The earliest iteration a producer can be handed setbacks on. A setback is
 * what the judges confirmed of an attempt that did not become best, and the
 * first judged attempt is the best until one beats it — so the ask after it,
 * the second, has none to hear, and the third is the first that can.
 */
const FIRST_SETBACK_ITERATION = 3;

describe('the pipeline registry', () => {
  it('[QL-1] holds instances of the one definition, each valid, none sharing an id', () => {
    expect([...PIPELINES.keys()]).toEqual([
      'system-design',
      'agentic-design',
      'memory-recall',
      'experience-digest',
      'system-design-canvas',
      'memory-architecture',
      'design-prompt',
      'browser-step',
      'tool-step',
      'field-answer',
      'interview-turn',
      'answer-suggestions',
      'document-digest',
      'knowledge-digest',
      'register-digest',
    ]);
    for (const definition of PIPELINES.values()) {
      expect(() => validatePipeline(definition)).not.toThrow();
      expect(definition.id).toBe(PIPELINES.get(definition.id)?.id);
    }
  });

  it('[QL-62] every pipeline declares what a lost produce costs: one produce is asked again', () => {
    for (const definition of PIPELINES.values()) {
      expect([definition.id, definition.policy.loop.lostProduces]).toEqual([definition.id, 1]);
      // What `GET /pipelines` and the dump carry says so too.
      expect(describePipeline(definition).policy).toMatchObject({ loop: { lostProduces: 1 } });
    }
  });

  it('[QL-56] a pipeline DECLARING a loop that reaches a third iteration declares setbacks', () => {
    // A declaration check, not a runtime guarantee: a run request replaces the
    // declared `maxIterations` (up to `MAX_QUALITY_RUN_ITERATIONS`), so a
    // pipeline whose declared loop stops short of the third ask can still be
    // run past it. That is why the reverse — a declaration on a short loop is
    // dead — is not asserted: an override can make it live.
    const reaches = (definition: PipelineDefinition<unknown>): boolean =>
      definition.policy.loop.maxIterations >= FIRST_SETBACK_ITERATION;
    const declares = (definition: PipelineDefinition<unknown>): boolean =>
      definition.producer.consumes.includes('setbacks');
    const registry = [...PIPELINES.values()];
    const ids = (definitions: PipelineDefinition<unknown>[]): string[] =>
      definitions.map((definition) => definition.id);

    // The rule is not vacuous: these loops reach the third ask.
    expect(ids(registry.filter(reaches))).toEqual([
      'system-design',
      'agentic-design',
      'system-design-canvas',
      'memory-architecture',
    ]);
    expect(
      ids(registry.filter((definition) => reaches(definition) && !declares(definition))),
      'a loop that reaches a third ask never tells its producer what the attempt before fell short on',
    ).toEqual([]);
  });
});
