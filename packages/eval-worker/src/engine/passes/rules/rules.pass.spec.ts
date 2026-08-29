import { describe, expect, it } from 'vitest';

import { buildGraphIndex } from '../../graph-index';
import { DEFAULT_PROFILE } from '../../profiles/default.profile';
import { edge, flashSaleFacts, graph, node } from '../../testing';
import { RULES_PASS_ID, runRules } from './rules.pass';

describe('rules pass severity policy', () => {
  // A queue with no DLQ: messaging.queue-no-dlq fires at 'low' by default.
  const canvas = graph(
    [node('svc-1', 'service'), node('q-1', 'queue'), node('worker-1', 'worker')],
    [edge('e1', 'svc-1', 'q-1', 'async'), edge('e2', 'q-1', 'worker-1', 'async')],
  );
  const profileOptions = DEFAULT_PROFILE.passes.find(
    (config) => config.pass === RULES_PASS_ID,
  )?.options;

  function dlqFinding(difficulty: 'standard' | 'advanced') {
    const artifact = runRules({
      graph: canvas,
      facts: flashSaleFacts({ difficulty }),
      index: buildGraphIndex(canvas),
      options: profileOptions,
    });
    return artifact.findings.find((finding) => finding.ruleId === 'messaging.queue-no-dlq');
  }

  it('re-grades the DLQ lesson to high at advanced via the profile option', () => {
    expect(profileOptions?.['severityOverrides']).toBeDefined();
    expect(dlqFinding('advanced')?.severity).toBe('high');
  });

  it('keeps the rule severity at standard difficulty', () => {
    expect(dlqFinding('standard')?.severity).toBe('low');
  });
});
