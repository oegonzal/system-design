import { REGISTER_KINDS } from '@sysdesign/contracts';

import { spaceUnderTest } from '../testing/space-under-test';
import { compileSpace } from '../space/compile';
import { strategyFixture, TEST_POLICY } from '../testing/fixtures';
import { contentHashOf, defineBehavior } from './behavior';
import { DEFAULT_BEHAVIORS } from './behaviors';

describe('the memory kinds as data', () => {
  it('[AGM-2] declares a behavior for every kind a strategy can keep, each by its identity, keys, valid time, projection and role', () => {
    expect(Object.keys(DEFAULT_BEHAVIORS).sort()).toEqual([...REGISTER_KINDS].sort());
    const table = Object.fromEntries(
      REGISTER_KINDS.map((kind) => {
        const behavior = DEFAULT_BEHAVIORS[kind];
        return [
          kind,
          [
            behavior.identity.join('+'),
            behavior.keys.join('+'),
            behavior.validFrom,
            behavior.projected,
            behavior.role,
          ],
        ];
      }),
    );
    expect(table).toEqual({
      working: ['key', 'key', null, false, null],
      episodic: ['', 'subject', 'occurredAt', true, 'source'],
      semantic: ['subject+predicate', 'subject', 'validFrom', true, 'lesson'],
      procedural: ['name', 'name', null, true, 'playbook'],
      relational: ['subject+relation+object', 'subject+object', 'validFrom', false, null],
    });
  });

  it('[AGM-2] runs a replaced behavior without an engine edit', () => {
    const projectedRelations = {
      ...DEFAULT_BEHAVIORS,
      relational: defineBehavior({ ...DEFAULT_BEHAVIORS.relational, projected: true }),
    };
    const { report } = compileSpace(strategyFixture(), TEST_POLICY, projectedRelations);
    expect(report.registers.find((register) => register.name === 'relations')?.projected).toBe(
      true,
    );
    expect(spaceUnderTest().ctx.space.registers.get('relations')?.behavior.projected).toBe(false);
  });

  it('[AGM-3] hashes what a kind that appends deduplicates on, its source run included', () => {
    const base = { register: 'episodes', scope: { tenant: 't1' }, body: { a: 1 }, source: 'agent' };
    expect(contentHashOf({ ...base, sourceRunId: 'r1' })).toBe(
      contentHashOf({ ...base, scope: { tenant: 't1' }, sourceRunId: 'r1' }),
    );
    expect(contentHashOf({ ...base, sourceRunId: 'r1' })).not.toBe(
      contentHashOf({ ...base, sourceRunId: 'r2' }),
    );
  });
});
