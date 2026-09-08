import { describe, expect, it } from 'vitest';

import { describePipeline, validatePipeline } from '../../core/pipeline';
import { AGENTIC_DESIGN } from './definition';
import { agenticDesignOutput, type AgenticDesign } from './output';

const answer: AgenticDesign = {
  summary: 'A graph engine that runs declared workflows over an arbitrary brief.',
  assumptions: ['agent processes may hang'],
  roles: [
    {
      name: 'Planner',
      responsibility: 'turns a brief into a node list',
      consumes: 'the brief, verbatim',
      produces: 'an ordered node list with prompts',
    },
    {
      name: 'Runner',
      responsibility: 'spawns one process per node',
      consumes: 'an ordered node list',
      produces: 'a result per node, or a stated reason',
    },
  ],
  contracts: [
    {
      from: 'Planner',
      to: 'Runner',
      payload: 'node list with prompts and dependencies',
      guarantee: 'acyclic, or refused before anything is spent',
    },
  ],
  flows: [{ name: 'run a brief', steps: ['Planner', 'Runner'] }],
  policies: [
    { name: 'concurrency', decides: 'how many nodes run at once', declaredAs: 'a workflow field' },
  ],
  memory: [{ what: 'node results', shape: 'keyed by prompt hash', usedBy: 'Runner, on resume' }],
  extensibility: [{ change: 'a new kind of node', requires: 'a declaration, no engine change' }],
  tradeoffs: [
    { decision: 'cache by prompt hash', rationale: 'resume must be cheap', alternative: null },
  ],
  risks: [{ risk: 'a node hangs', mitigation: 'bounded wait, then a stated reason' }],
};

describe('the agentic-design pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(AGENTIC_DESIGN as never)).not.toThrow();
    const summary = describePipeline(AGENTIC_DESIGN as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...AGENTIC_DESIGN.critics, ...AGENTIC_DESIGN.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(AGENTIC_DESIGN.producer.persona).toContain('agentic-design');
  });

  it('[QL-1] every dimension earns from a criterion kind, so none can only fall', () => {
    const earning = new Set(
      Object.values(AGENTIC_DESIGN.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(AGENTIC_DESIGN.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
  });

  it('[QL-4] every location the answer exposes is printed verbatim where a judge reads it', () => {
    const rendered = agenticDesignOutput.render(answer);
    for (const location of agenticDesignOutput.locate(answer)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
    expect(agenticDesignOutput.locate(answer).map((location) => location.id)).toEqual([
      'summary',
      'assumption.1',
      'role.1',
      'role.2',
      'contract.1',
      'flow.1',
      'policy.1',
      'memory.1',
      'extension.1',
      'tradeoff.1',
      'risk.1',
    ]);
    expect(agenticDesignOutput.schema.safeParse(answer).success).toBe(true);
  });
});
