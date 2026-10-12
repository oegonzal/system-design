import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { validateOrchestrator, type OrchestratorDefinition } from './definition';

type Outputs = { a: string; b: string };

const tiny = (
  overrides: Partial<OrchestratorDefinition<Outputs, unknown>> = {},
): OrchestratorDefinition<Record<string, unknown>, unknown> =>
  ({
    id: 'tiny',
    version: '0.0.1',
    description: 'two steps',
    takesTarget: true,
    reasons: ['because'],
    context: () => Promise.resolve({}),
    contextSchema: z.strictObject({}),
    reports: {},
    steps: [
      { id: 'a', run: () => Promise.resolve({ status: 'complete', output: 'x' }) },
      { id: 'b', needs: ['a'], run: () => Promise.resolve({ status: 'complete', output: 'y' }) },
    ],
    ...overrides,
  }) as unknown as OrchestratorDefinition<Record<string, unknown>, unknown>;

describe('validateOrchestrator', () => {
  it('[QL-18] accepts a well-formed orchestrator', () => {
    expect(() => validateOrchestrator(tiny())).not.toThrow();
  });

  it('[QL-18] refuses a duplicate step, a need that points forward, no steps, and a runner reason redeclared', () => {
    const base = tiny();
    expect(() =>
      validateOrchestrator(tiny({ steps: [base.steps[0], base.steps[0]] as never })),
    ).toThrow(/declared twice/);
    expect(() =>
      validateOrchestrator(tiny({ steps: [base.steps[1], base.steps[0]] as never })),
    ).toThrow(/needs a, which does not run before it/);
    expect(() => validateOrchestrator(tiny({ steps: [] }))).toThrow(/no steps/);
    expect(() => validateOrchestrator(tiny({ reasons: ['run-failed'] }))).toThrow(
      /belongs to the runner/,
    );
  });

  it('[QL-67] refuses a report shape declared for a step that does not exist, and accepts one for a step that does', () => {
    expect(() =>
      validateOrchestrator(tiny({ reports: { c: z.strictObject({}) } } as never)),
    ).toThrow(/reports declares a shape for c, which is no step/);
    expect(() =>
      validateOrchestrator(tiny({ reports: { a: z.strictObject({ n: z.number() }) } })),
    ).not.toThrow();
  });
});
