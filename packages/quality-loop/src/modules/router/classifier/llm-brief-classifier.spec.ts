import { bound } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { fakeLlm } from '../../../core/testing';
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

  it('[QL-19] a reason past the size it is asked for is kept whole: the classification stands, and the model was asked for the target', async () => {
    const schemas: unknown[] = [];
    const reason = `${'roles and contracts, '.repeat(30)}end`;
    const llm = fakeLlm({ pipeline: 'agentic-design', rationale: reason }).withRecorder((call) => {
      schemas.push(call.schema);
    });
    expect(await new LlmBriefClassifier(llm).classify('brief', routes)).toEqual({
      pipeline: 'agentic-design',
      rationale: reason,
    });
    expect(reason.length).toBeGreaterThan(bound(400).ceiling);
    expect(schemas[0]).toMatchObject({ properties: { rationale: { maxLength: 400 } } });
  });

  it('[QL-19] without routes there is nothing to ask and the answer is null', async () => {
    const calls: string[] = [];
    const llm = fakeLlm({ pipeline: 'system-design', rationale: 'x' }).withRecorder((call) => {
      calls.push(call.user);
    });
    expect(await new LlmBriefClassifier(llm).classify('brief', [])).toBeNull();
    expect(calls).toEqual([]);
  });
});
