import type { MemoryClient } from '@sysdesign/agentic-memory-client';
import { memoryClientUnderTest } from '@sysdesign/agentic-memory-client/testing';
import type { MemoryStrategy } from '@sysdesign/contracts';

import { NO_TENANT, SESSION_ENV } from '../../config';
import { SessionRefused } from '../../core/unit-advice';
import { UNJUDGED_RUN, type MemoryBrainSettings } from '../../settings';
import { bindBrainSpace, memoryTenantOf, scopeOf } from './binding';
import {
  ANSWERS_REGISTER,
  ASSISTANT_RUN,
  assistantStrategy,
  BRAIN_SETTINGS,
  SPACE_NAME,
  unitValue,
} from './testing';

/** The runtime's test policy with two scope keys and no project: a space every request of this program cannot address. */
const TWO_KEY_POLICY = {
  scopeKeys: ['tenant', 'unit'],
  terms: { short_term: { ttlSeconds: 600 }, long_term: { ttlSeconds: null } },
  recall: {
    maxItems: 5,
    maxChars: 2000,
    weights: { similarity: 0.5, exact: 0.3, recency: 0.1, support: 0.1 },
    recencyHalfLifeDays: 30,
  },
  consolidation: { minSupport: 2, promoteAt: 3 },
};

/** A client whose declared run makes the strategy given, under the four-key policy unless another is named. */
const clientOver = (
  strategy: MemoryStrategy = assistantStrategy(),
  policy?: typeof TWO_KEY_POLICY,
): MemoryClient =>
  memoryClientUnderTest({
    strategies: { [ASSISTANT_RUN]: strategy },
    ...(policy === undefined ? {} : { policy }),
  }).client;

type RegisterNeed = MemoryBrainSettings['binding']['registers'][string];

/** The shipped settings with the teach register's need declared otherwise. */
const withTeachNeed = (overrides: Partial<RegisterNeed>): MemoryBrainSettings => ({
  ...BRAIN_SETTINGS,
  binding: {
    ...BRAIN_SETTINGS.binding,
    registers: {
      ...BRAIN_SETTINGS.binding.registers,
      [BRAIN_SETTINGS.teach]: {
        ...(BRAIN_SETTINGS.binding.registers[BRAIN_SETTINGS.teach] as RegisterNeed),
        ...overrides,
      },
    },
  },
});

/** The shipped settings with the binding's scope keys spelled otherwise. */
const withScope = (scope: MemoryBrainSettings['binding']['scope']): MemoryBrainSettings => ({
  ...BRAIN_SETTINGS,
  binding: { ...BRAIN_SETTINGS.binding, scope },
});

/** Why the boot refused the session, or that it bound. */
async function refusalOf(client: MemoryClient, settings: MemoryBrainSettings): Promise<string> {
  try {
    await bindBrainSpace(client, settings);
  } catch (error) {
    if (error instanceof SessionRefused) return error.message;
    throw error;
  }
  return 'bound';
}

describe('binding the brain to its space at boot', () => {
  it('[BRW-24] refuses the session by name — a tenant left unnamed, a space that does not serve the binding or this program, a strategy that does not compile, a run the host has not — every unmet need in one refusal', async () => {
    expect(() => memoryTenantOf(NO_TENANT)).toThrow(SessionRefused);
    expect(() => memoryTenantOf(NO_TENANT)).toThrow(
      new RegExp(`^${SESSION_ENV.memoryTenant.name} is ${NO_TENANT}`),
    );
    expect(memoryTenantOf('t-1')).toBe('t-1');

    await expect(
      refusalOf(clientOver(assistantStrategy({ answerMetadata: ['question'] })), BRAIN_SETTINGS),
    ).resolves.toMatch(
      /^the memory brain cannot start: .*role standing-answer: register standing_answer declares no metadata field channel/,
    );

    const dangling = assistantStrategy({
      interfaces: [
        {
          operation: 'recall',
          register: 'nowhere',
          input: 'a request',
          output: 'an answer',
          guarantee: 'scoped',
        },
      ],
    });
    await expect(refusalOf(clientOver(dangling), BRAIN_SETTINGS)).resolves.toMatch(
      /does not compile: .*interface\.unknown_register/,
    );

    await expect(
      refusalOf(clientOver(), {
        ...BRAIN_SETTINGS,
        binding: { ...BRAIN_SETTINGS.binding, space: { name: SPACE_NAME, runId: 'run-nobody' } },
      }),
    ).resolves.toMatch(/no run run-nobody/);

    await expect(
      refusalOf(clientOver(assistantStrategy(), TWO_KEY_POLICY), BRAIN_SETTINGS),
    ).resolves.toMatch(/declares no scope key project, which every request names/);

    // The binding's unmet needs and this program's, collected before the one refusal.
    const message = await refusalOf(
      clientOver(assistantStrategy({ answerMetadata: ['question', 'channel', 'topic'] })),
      withTeachNeed({ kind: 'episodic', metadata: ['question', 'channel', 'topic'] }),
    );
    expect(message).toMatch(/register standing_answer keeps semantic memory, not episodic/);
    expect(message).toMatch(/an answer is taught as semantic memory, not episodic/);
    expect(message).toMatch(
      /nothing fills the metadata field topic; this program fills question, channel/,
    );
  });

  it('[BRW-24] refuses a binding whose unit or partition key is the project key this program names every request under — a request would write one value over the other — and one whose run nobody has judged, before any space is ensured', async () => {
    await expect(
      refusalOf(clientOver(), withScope({ partition: 'tenant', unit: 'project' })),
    ).resolves.toMatch(
      /the binding's unit key is project, the key this program names its project under/,
    );
    await expect(
      refusalOf(clientOver(), withScope({ partition: 'project', unit: 'unit' })),
    ).resolves.toMatch(/the binding's partition key is project/);

    const client = clientOver();
    const unjudged: MemoryBrainSettings = {
      ...BRAIN_SETTINGS,
      binding: {
        ...BRAIN_SETTINGS.binding,
        space: { name: SPACE_NAME, runId: UNJUDGED_RUN },
      },
    };
    await expect(refusalOf(client, unjudged)).resolves.toMatch(
      new RegExp(
        `names no judged run for the space ${SPACE_NAME} \\(binding\\.space\\.runId is ${UNJUDGED_RUN}\\)`,
      ),
    );
    // Nothing was ensured: the name is still free for the judged run to take.
    expect(await client.getSpaceByName(SPACE_NAME)).toBeNull();
  });

  it("[BRW-24] binds a space that serves the binding — the same space again — and spells every request's scope from it: the tenant, the project, and the unit of work hashed when one is open and the binding narrows by one", async () => {
    const client = clientOver();
    const bound = await bindBrainSpace(client, BRAIN_SETTINGS);
    // A role is this program's word; the register it names is the strategy's. The bound space translates the two.
    expect(bound).toEqual({
      spaceId: expect.any(String),
      registers: {
        'profile-fact': 'profile_fact',
        'profile-story': 'profile_story',
        'claim-boundary': 'claim_boundary',
        'standing-answer': ANSWERS_REGISTER,
      },
      scope: { partition: 'tenant', unit: 'unit' },
    });
    expect((await bindBrainSpace(client, BRAIN_SETTINGS)).spaceId).toBe(bound.spaceId);

    expect(scopeOf(bound, 't-1', 'assistant', null)).toEqual({
      tenant: 't-1',
      project: 'assistant',
    });
    // The unit's key is hashed into the scope — sha256, so any declared identity fits the value's bound.
    expect(scopeOf(bound, 't-1', 'assistant', 'u-1')).toEqual({
      tenant: 't-1',
      project: 'assistant',
      unit: unitValue('u-1'),
    });
    expect(unitValue('u-1')).toMatch(/^[0-9a-f]{64}$/);
    expect(unitValue('u-1')).not.toBe(unitValue('u-2'));
    const narrowsByNone = { ...bound, scope: { partition: 'tenant', unit: null } };
    expect(scopeOf(narrowsByNone, 't-1', 'assistant', 'u-1')).toEqual({
      tenant: 't-1',
      project: 'assistant',
    });
  });
});
