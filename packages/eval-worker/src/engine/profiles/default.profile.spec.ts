import { describe, expect, it } from 'vitest';

import { EXPECTATIONS } from '../passes/expectations/banks';
import { RULES_PASS_ID } from '../passes/rules/rules.pass';
import { RULES } from '../rules';
import { DEFAULT_PROFILE } from './default.profile';

/**
 * Drift protection: the profile names rule and expectation ids as plain
 * strings, so a renamed registry entry would silently orphan its suppression
 * or override. This spec pins every reference to the registries — here, not
 * in core, which stays free of registry imports.
 */

const ruleIds = new Set(RULES.map((rule) => rule.id));
const expectationIds = new Set(EXPECTATIONS.map((expectation) => expectation.id));

describe('DEFAULT_PROFILE registry integrity', () => {
  it('pairs every suppression with a rule and an expectation that exist', () => {
    for (const suppression of DEFAULT_PROFILE.scoring.suppressions) {
      expect(ruleIds.has(suppression.ruleId), `unknown rule: ${suppression.ruleId}`).toBe(true);
      expect(
        expectationIds.has(suppression.whenExpectationUnmet),
        `unknown expectation: ${suppression.whenExpectationUnmet}`,
      ).toBe(true);
    }
  });

  it('overrides severity only for rules that exist', () => {
    const rulesPass = DEFAULT_PROFILE.passes.find((config) => config.pass === RULES_PASS_ID);
    const overrides = (rulesPass?.options?.['severityOverrides'] ?? {}) as Record<string, unknown>;
    expect(Object.keys(overrides).length).toBeGreaterThan(0);
    for (const ruleId of Object.keys(overrides)) {
      expect(ruleIds.has(ruleId), `unknown rule: ${ruleId}`).toBe(true);
    }
  });
});
