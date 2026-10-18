import { CANDIDATE_VALID_TIME, REGISTER_KINDS } from '@sysdesign/contracts';

import { spaceUnderTest } from '../testing/space-under-test';
import { compileSpace } from '../space/compile';
import { strategyFixture, TEST_POLICY } from '../testing/fixtures';
import { contentHashOf, defineBehavior } from './behavior';
import { DEFAULT_BEHAVIORS, LESSON_PREDICATE } from './behaviors';

describe('the memory kinds as data', () => {
  it('[AGM-2] declares a behavior for every kind a strategy can keep, each by its identity, keys, valid time and projection', () => {
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
          ],
        ];
      }),
    );
    expect(table).toEqual({
      working: ['key', 'key', null, false],
      episodic: ['', 'subject', 'occurredAt', true],
      semantic: ['subject+predicate', 'subject', 'validFrom', true],
      procedural: ['name', 'name', null, true],
      relational: ['subject+relation+object', 'subject+object', 'validFrom', false],
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

  it('[AGM-11] dates every kind by the valid-time field the contract declares for its candidate', () => {
    expect(
      Object.fromEntries(REGISTER_KINDS.map((kind) => [kind, DEFAULT_BEHAVIORS[kind].validFrom])),
    ).toEqual(CANDIDATE_VALID_TIME);
  });

  it('[AGM-11] reserves on the lesson kind the identity every consolidated lesson is written under, and nothing on any other', () => {
    expect(
      Object.fromEntries(REGISTER_KINDS.map((kind) => [kind, DEFAULT_BEHAVIORS[kind].reserved])),
    ).toEqual({
      working: [],
      episodic: [],
      semantic: [{ field: 'predicate', value: LESSON_PREDICATE }],
      procedural: [],
      relational: [],
    });
    const lesson = {
      key: 'retry-on-timeout',
      text: 'Retry a timed-out call once.',
      playbook: null,
    };
    for (const behavior of Object.values(DEFAULT_BEHAVIORS)) {
      for (const { field, value } of behavior.reserved) {
        expect(behavior.identity).toContain(field);
        expect(behavior.fromLesson?.(lesson)[field]).toBe(value);
      }
    }
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
