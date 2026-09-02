import { describe, expect, it } from 'vitest';
import { ARCHETYPES, PROMPT_DIFFICULTIES, validateWorkflowSpec } from '@sysdesign/contracts';
import type { LlmClient } from '@sysdesign/llm';

import type { RequirementBank } from './requirement-banks';
import { REQUIREMENT_BANKS } from './requirement-banks';
import { WORKFLOW_SPECS } from './workflow-specs';

describe('WORKFLOW_SPECS', () => {
  it('LLM enrichment is structurally unable to touch the spec', async () => {
    // The polish returns only { scenario, functionalRequirements, llmEnriched }
    // — a workflowSpec key on it would mean prose polish could reshape the
    // graded surface. Assert the shape stays closed.
    const { enrichPrompt } = await import('./enrich-prompt');
    const disabled: LlmClient = {
      enabled: false,
      model: 'none',
      completeStructured: () => Promise.resolve(null),
    };
    const enriched = await enrichPrompt(
      disabled,
      {
        title: 't',
        scenario: 's',
        functionalRequirements: [],
        functionalCapabilities: [],
        nonFunctionalRequirements: [],
        scaleTargets: {
          concurrentUsers: 1,
          requestsPerSecond: 1,
          readWriteRatio: '1:1',
          p99LatencyMs: 1,
          availabilityPct: '99',
        },
        workflowSpec: WORKFLOW_SPECS['order-history-integration']('intro'),
      },
      {
        slug: 's',
        archetype: 'order-history-integration',
        scaleFacts: {},
        companyLabel: 'c',
        title: 't',
        highlights: ['h'],
      },
    );
    expect(Object.keys(enriched).sort()).toEqual([
      'functionalRequirements',
      'llmEnriched',
      'scenario',
    ]);
  });

  it('only order-history carries a spec — a spec on any other archetype is a deliberate re-grading', () => {
    for (const archetype of ARCHETYPES) {
      for (const difficulty of PROMPT_DIFFICULTIES) {
        const spec = WORKFLOW_SPECS[archetype](difficulty);
        if (archetype === 'order-history-integration') {
          expect(spec).not.toBeNull();
        } else {
          expect(spec).toBeNull();
        }
      }
    }
  });

  it("every difficulty's filtered view is closed — no reference survives its referent", () => {
    for (const difficulty of PROMPT_DIFFICULTIES) {
      const spec = WORKFLOW_SPECS['order-history-integration'](difficulty);
      expect(validateWorkflowSpec(spec!)).toEqual([]);
    }
  });

  it('every ingest quotes a freshness budget the bank actually states', () => {
    // Annotated: the `as const` bank narrows entries to literal types that
    // hide optional fields like `targetSpec`.
    const bank: RequirementBank = REQUIREMENT_BANKS['order-history-integration'];
    for (const difficulty of PROMPT_DIFFICULTIES) {
      const spec = WORKFLOW_SPECS['order-history-integration'](difficulty)!;
      expect(spec.ingests.length).toBeGreaterThan(0);
      for (const ingest of spec.ingests) {
        const nfr = bank.nfrs.find((n) => n.id === ingest.nfrId);
        expect(nfr, `ingest ${ingest.id} names missing NFR ${ingest.nfrId}`).toBeDefined();
        expect(nfr?.targetSpec?.metric).toBe('freshness_seconds');
        expect(nfr?.targetSpec?.op).toBe('<=');
      }
    }
  });

  it('the ladder: intro is the original assessment; refunds, failure paths and the aggregate join at standard', () => {
    const intro = WORKFLOW_SPECS['order-history-integration']('intro')!;
    expect(intro.aggregations).toEqual([]);
    expect(intro.operations.every((op) => (op.onFailureEmits ?? []).length === 0)).toBe(true);
    expect(intro.events.map((event) => event.id)).toEqual([
      'evt-online-order-received',
      'evt-offline-order-received',
    ]);
    expect(intro.entities[0].states).not.toContain('amended');

    const standard = WORKFLOW_SPECS['order-history-integration']('standard')!;
    expect(standard.aggregations.map((agg) => agg.id)).toEqual(['agg-spend-summary']);
    expect(standard.events.map((event) => event.id)).toContain('evt-order-refunded');
    expect(
      standard.operations.some((op) => (op.onFailureEmits ?? []).includes('evt-ingest-failed')),
    ).toBe(true);
  });
});
