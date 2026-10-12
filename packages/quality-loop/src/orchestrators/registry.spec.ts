import { describe, expect, it } from 'vitest';

import { ORCHESTRATORS } from './index';
import { validateOrchestrator } from './runner/definition';

/** The registry as it ships: every orchestrator well-formed data, each shape it declares naming a step it has. */
describe('the orchestrator registry', () => {
  it('[QL-18] [QL-67] every registered orchestrator validates, and declares a context shape and a report shape per reporting step', () => {
    expect(ORCHESTRATORS.size).toBeGreaterThan(5);
    for (const definition of ORCHESTRATORS.values()) {
      expect(() => validateOrchestrator(definition), definition.id).not.toThrow();
      const steps = definition.steps.map((step) => step.id);
      for (const id of Object.keys(definition.reports)) expect(steps, definition.id).toContain(id);
      expect(typeof definition.contextSchema.safeParse, definition.id).toBe('function');
    }
  });
});
