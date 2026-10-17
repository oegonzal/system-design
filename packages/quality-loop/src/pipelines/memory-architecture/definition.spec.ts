import { boundsAgainstMeasured, type MemoryStrategy } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { describePipeline } from '../../core/describe-pipeline';
import { validatePipeline } from '../../core/validate-pipeline';
import { capsAgainstMeasured, deriverSchema } from '../../core/testing';
import { MEMORY_ARCHITECTURE } from './definition';
import measured from './measured.json';
import { memoryStrategyOutput } from './output';

const CRITERION_KINDS = [
  'capability',
  'recall_target',
  'ingestion_rule',
  'scoping_rule',
  'lifecycle_rule',
  'constraint',
];
const FINDING_TYPES = [
  'missing_capability',
  'unbacked_claim',
  'unexplained_component',
  'contradiction',
  'recall_defect',
  'ingestion_defect',
  'lifecycle_gap',
  'scoping_defect',
  'metadata_gap',
  'constraint_violation',
  'poisoning_risk',
];

/** A minimal memory strategy: one semantic register, recall + remember over it, both exercised by a workflow. */
const sample = (): MemoryStrategy => ({
  summary:
    'An agent keeps semantic facts and recalls them by meaning and exact key, writing each through a controlled pipeline with provenance.',
  assumptions: ['many tenants share one store'],
  registers: [
    {
      name: 'semantic',
      kind: 'semantic',
      term: 'long_term',
      holds: 'atomic facts — subject, predicate, value, validity',
      store: 'relational rows with a derived, rebuildable vector index',
      scope: 'tenant then user; never crossed on recall',
      metadata: ['subject', 'status', 'valid_from'],
      lifecycle: 'supersede on update, keep history; reindex on embedding-model change',
    },
  ],
  interfaces: [
    {
      operation: 'recall',
      register: 'semantic',
      input: 'query, scope, token budget',
      output: 'a ranked, cited set within the budget',
      guarantee: 'never crosses a tenant; cites every item',
    },
    {
      operation: 'remember',
      register: 'semantic',
      input: 'a fact with its provenance',
      output: 'the stored memory id',
      guarantee: 'idempotent by content hash; provenance kept',
    },
  ],
  workflows: [
    {
      name: 'answer a question',
      kind: 'recall_routing',
      steps: [
        {
          operation: 'recall',
          register: 'semantic',
          does: 'route by meaning and key, rerank, budget, cite',
        },
      ],
    },
    {
      name: 'remember a fact',
      kind: 'write_pipeline',
      steps: [
        {
          operation: 'remember',
          register: 'semantic',
          does: 'extract, deduplicate, persist with provenance',
        },
      ],
    },
  ],
  safeguards: [
    {
      rule: 'retrieved memory is data, never instructions',
      mechanism: 'recall output is quoted into context, never spliced into the system prompt',
    },
  ],
  tradeoffs: [
    {
      decision: 'relational source of truth',
      rationale: 'exact lookup plus a rebuildable index',
      alternative: null,
    },
  ],
  risks: [
    {
      risk: 'a superseded fact returned as current',
      mitigation: 'a valid_to filter on every recall',
    },
  ],
});

describe('the memory-architecture pipeline', () => {
  it('[QL-1] is valid data with md personas loaded beside it', () => {
    expect(() => validatePipeline(MEMORY_ARCHITECTURE as never)).not.toThrow();
    const summary = describePipeline(MEMORY_ARCHITECTURE as never);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
    for (const lens of [...MEMORY_ARCHITECTURE.critics, ...MEMORY_ARCHITECTURE.evaluators]) {
      expect(lens.persona.length).toBeGreaterThan(80);
    }
    expect(MEMORY_ARCHITECTURE.deriveCriteria.persona.length).toBeGreaterThan(80);
    expect(MEMORY_ARCHITECTURE.id).toBe('memory-architecture');
    expect(MEMORY_ARCHITECTURE.goalSource).toBe('brief');
    expect(MEMORY_ARCHITECTURE.producer.consumes).toEqual(['memories', 'setbacks']);
    // The coach designs a memory strategy — its registers, interfaces and workflows.
    expect(MEMORY_ARCHITECTURE.producer.persona).toContain('register');
  });

  it('[QL-1] its kinds and finding types are exactly the declared sets, priced and gated', () => {
    expect(Object.keys(MEMORY_ARCHITECTURE.task.criterionKinds)).toEqual(CRITERION_KINDS);
    expect(Object.keys(MEMORY_ARCHITECTURE.policy.criterionKinds)).toEqual(CRITERION_KINDS);
    expect(Object.keys(MEMORY_ARCHITECTURE.task.findingTypes)).toEqual(FINDING_TYPES);
    expect(Object.keys(MEMORY_ARCHITECTURE.policy.findingTypes)).toEqual(FINDING_TYPES);
    // Only the two an unanticipated input cannot recover from gate.
    const gatedFindings = FINDING_TYPES.filter(
      (type) => MEMORY_ARCHITECTURE.policy.findingTypes[type].gate,
    );
    expect(gatedFindings).toEqual(['constraint_violation', 'poisoning_risk']);
    expect(MEMORY_ARCHITECTURE.policy.criterionKinds.constraint.gate).toBe(true);
  });

  it('[QL-1] every dimension earns from a criterion kind, so none can only fall', () => {
    const earning = new Set(
      Object.values(MEMORY_ARCHITECTURE.policy.criterionKinds).map((kind) => kind.dimension),
    );
    for (const dimension of Object.keys(MEMORY_ARCHITECTURE.policy.dimensionWeights)) {
      expect(earning).toContain(dimension);
    }
  });

  it('[QL-4] the memory-strategy artifact: every location is printed verbatim where a judge reads it', () => {
    const strategy = sample();
    expect(memoryStrategyOutput.schema.safeParse(strategy).success).toBe(true);
    expect(memoryStrategyOutput.locate(strategy).map((location) => location.id)).toEqual([
      'summary',
      'assumption.1',
      'register.1',
      'interface.1',
      'interface.2',
      'workflow.1',
      'workflow.2',
      'safeguard.1',
      'tradeoff.1',
      'risk.1',
    ]);
    const rendered = memoryStrategyOutput.render(strategy);
    for (const location of memoryStrategyOutput.locate(strategy)) {
      expect(rendered).toContain(`[${location.id}]`);
    }
  });

  it('[QL-49] every declared field bound sits above what the producer and deriver have measurably written', () => {
    // `measured.json` fields across the recorded runs, refreshed by `pnpm measure:bounds`.
    expect(
      boundsAgainstMeasured(
        [memoryStrategyOutput.schema, deriverSchema(MEMORY_ARCHITECTURE.task)],
        measured.fields,
      ),
    ).toEqual([]);
  });

  it('[QL-33] every declared output cap is a fifth above what its stage has measurably written', () => {
    expect(measured.runs).toBeGreaterThan(0);
    expect(capsAgainstMeasured(MEMORY_ARCHITECTURE, measured.caps)).toEqual([]);
  });
});
