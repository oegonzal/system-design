import { describe, expect, it } from 'vitest';

import { disabledLlm, fakeLlm } from '../../../core/testing';
import { noClassifier } from '../../../orchestrators/router/ports';
import { LlmBriefClassifier, renderRoutes } from './llm-brief-classifier';

const routes = [
  { id: 'system-design', description: 'A system, judged for coverage and scale.' },
  { id: 'agentic-design', description: 'An agentic workflow, judged for its contracts.' },
];

describe('the brief classifier', () => {
  it('[QL-19] answers with one of the routes and why, having shown the model every route and the whole brief', async () => {
    const seen: string[] = [];
    const llm = fakeLlm({
      pipeline: 'agentic-design',
      rationale: 'roles and contracts',
    }).withRecorder((call) => {
      seen.push(call.user);
    });
    const classifier = new LlmBriefClassifier(llm);
    expect(classifier.enabled).toBe(true);
    expect(await classifier.classify('# Brief\n\nthe deciding sentence', routes)).toEqual({
      pipeline: 'agentic-design',
      rationale: 'roles and contracts',
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContain(renderRoutes(routes));
    expect(seen[0]).toContain('- system-design: A system, judged for coverage and scale.');
    expect(seen[0]).toContain('## Brief\n# Brief\n\nthe deciding sentence');
  });

  it('[QL-19] an id outside the routes is a miss, not a route: the schema is locked to the registry', async () => {
    const classifier = new LlmBriefClassifier(fakeLlm({ pipeline: 'nope', rationale: 'invented' }));
    expect(await classifier.classify('brief', routes)).toBeNull();
  });

  it('[QL-19] without a model, or without routes, there is nothing to ask and the answer is null', async () => {
    expect(noClassifier.enabled).toBe(false);
    expect(await noClassifier.classify('brief', routes)).toBeNull();
    expect(await new LlmBriefClassifier(disabledLlm()).classify('brief', routes)).toBeNull();

    const calls: string[] = [];
    const llm = fakeLlm({ pipeline: 'system-design', rationale: 'x' }).withRecorder((call) => {
      calls.push(call.user);
    });
    expect(await new LlmBriefClassifier(llm).classify('brief', [])).toBeNull();
    expect(calls).toEqual([]);
  });
});
