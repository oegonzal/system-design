import { rmSync } from 'node:fs';

import type { TestingModule } from '@nestjs/testing';
import { MemoryClient } from '@sysdesign/agentic-memory-client';
import { memoryClientUnderTest } from '@sysdesign/agentic-memory-client/testing';

import { LoopBrain } from '../../adapters/loop-http/loop-brain';
import { MemoryLoopBrain } from '../../adapters/memory-loop/memory-loop-brain';
import { assistantStrategy, guidance } from '../../adapters/memory-loop/testing';
import { NO_TENANT, SESSION_ENV, SESSION_FLAGS } from '../../config';
import { SessionRefused } from '../../core/unit-advice';
import {
  bootJourney,
  journeyConfig,
  journeyFakes,
  journeyHome,
  journeySettings,
} from './session-journey.testing';
import { BRAIN, BRAIN_FOR_TENANT, type BrainForTenant } from './tokens';

/**
 * The composition root's brain, as the module as it ships composes it over
 * the memory client — the one piece the journeys override: under the memory
 * brain a `MemoryLoopBrain` that binds only when told to, refusing by name a
 * tenant nobody chose or a space that does not serve the binding; a brain for
 * another tenant on request; and under the loop brain no memory client at all,
 * a tenant named to it refused by name.
 */
describe('the session module composes the brain the settings choose', () => {
  const JUDGED_RUN = 'run-judged-module';
  const homes: string[] = [];
  const modules: TestingModule[] = [];

  afterAll(async () => {
    for (const moduleRef of modules) await moduleRef.close();
    for (const home of homes) rmSync(home, { recursive: true, force: true });
  });

  /** The module booted under the memory brain, over the runtime in process made of the strategy given, for the tenant named. */
  async function memoryModule(tenant: string, strategy = assistantStrategy()) {
    const home = journeyHome();
    homes.push(home);
    const { client, records } = memoryClientUnderTest({ strategies: { [JUDGED_RUN]: strategy } });
    const moduleRef = await bootJourney(
      journeyConfig(home, journeySettings('memory', JUDGED_RUN), tenant),
      journeyFakes(),
      null,
      (builder) => builder.overrideProvider(MemoryClient).useValue(client),
    );
    modules.push(moduleRef);
    return { moduleRef, records };
  }

  it('[BRW-24] composes a memory brain that asks the host nothing until told to bind, then binds the space for the environment’s tenant — a tenant left unnamed refused by name — and a brain for another tenant on request, writing under that tenant', async () => {
    const { moduleRef, records } = await memoryModule('t-module');
    const brain = moduleRef.get<MemoryLoopBrain>(BRAIN);
    expect(brain).toBeInstanceOf(MemoryLoopBrain);
    // Composed, nothing was ensured: the space stands only once a run or a teaching binds.
    expect(await moduleRef.get(MemoryClient).getSpaceByName('job-assistant')).toBeNull();
    await brain.bind();
    expect(await moduleRef.get(MemoryClient).getSpaceByName('job-assistant')).toMatchObject({
      name: 'job-assistant',
    });

    const forTenant = moduleRef.get<BrainForTenant>(BRAIN_FOR_TENANT);
    const verifying = forTenant('verify-module');
    expect(verifying).toBeInstanceOf(MemoryLoopBrain);
    await verifying.bind();
    const [receipt] = await verifying.teach(
      [guidance({ question: 'Preferred name?', answer: 'Alex' })],
      { sessionId: '11111111-1111-4111-8111-111111111111', step: 0 },
      'Alex Example',
    );
    expect(receipt).toMatchObject({ outcome: 'inserted' });
    expect(records.all().find((row) => row.id === receipt?.ref)?.scope).toMatchObject({
      tenant: 'verify-module',
      project: 'job-assistant',
    });

    const unnamed = await memoryModule(NO_TENANT);
    await expect(unnamed.moduleRef.get<MemoryLoopBrain>(BRAIN).bind()).rejects.toThrow(
      new RegExp(`^${SESSION_ENV.memoryTenant.name} is ${NO_TENANT}`),
    );
  });

  it('[BRW-24] refuses at bind, by name, a space whose strategy does not serve the binding — every unmet need in one refusal', async () => {
    const { moduleRef } = await memoryModule(
      't-module-unserved',
      assistantStrategy({ answerMetadata: ['question'] }),
    );
    const binding = moduleRef.get<MemoryLoopBrain>(BRAIN).bind();
    await expect(binding).rejects.toBeInstanceOf(SessionRefused);
    await expect(binding).rejects.toThrow(
      /the memory brain cannot start: .*register standing_answer declares no metadata field channel/,
    );
  });

  it('[BRW-24] under the loop brain provides no memory client, composes the loop’s brain, and refuses by name a tenant named to it', async () => {
    const home = journeyHome();
    homes.push(home);
    const moduleRef = await bootJourney(
      journeyConfig(home, journeySettings('loop')),
      journeyFakes(),
      null,
    );
    modules.push(moduleRef);
    expect(moduleRef.get(BRAIN)).toBeInstanceOf(LoopBrain);
    expect(() => moduleRef.get(MemoryClient)).toThrow();
    const forTenant = moduleRef.get<BrainForTenant>(BRAIN_FOR_TENANT);
    expect(() => forTenant('verify-1')).toThrow(SessionRefused);
    expect(() => forTenant('verify-1')).toThrow(
      `${SESSION_FLAGS.tenant.name} names a tenant, and the chosen brain is loop`,
    );
  });
});
