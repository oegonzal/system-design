/**
 * The Memory Service: the typed API a host serves over its spaces. A space is
 * compiled on every load from the strategy and policy it keeps — compile is
 * pure and cheap, so nothing is cached and nothing goes stale — and a space
 * whose snapshot no longer reads, or no longer compiles, answers every verb
 * with `space.not_compiled`. Which verbs a register serves is the strategy's
 * declaration, enforced on every call.
 */
import {
  memoryStrategySchema,
  parseLenient,
  type CompileReportDto,
  type ConsolidationResultDto,
  type MemoryRecordDto,
  type MemorySpaceDto,
  type RecallResultDto,
  type WriteResultDto,
} from '@sysdesign/contracts';

import type { BehaviorRegistry } from '../kinds/behavior';
import { DEFAULT_BEHAVIORS } from '../kinds/behaviors';
import { consolidate } from '../lifecycle/consolidate';
import { sweep, type SweepReport } from '../lifecycle/sweep';
import type { MemoryPorts, StoredSpace } from '../ports';
import { recall } from '../recall/recall';
import { refuse } from '../refusal';
import { compileSpace, type CompileResult } from '../space/compile';
import { memoryPolicySchema, type MemoryPolicy } from '../space/policy';
import { history, invalidate, remember, update, type SpaceContext } from '../write/write';

type Verb<F extends (ctx: SpaceContext, request: never) => unknown> = Parameters<F>[1];

const unreadable = (
  code: 'strategy.unreadable' | 'policy.unreadable',
  what: string,
): CompileResult => ({
  compiled: null,
  report: {
    problems: [{ code, refs: [], message: `the space's ${what} no longer reads` }],
    warnings: [],
    registers: [],
    consolidation: null,
  },
});

export class MemoryService {
  constructor(
    private readonly ports: MemoryPorts,
    private readonly behaviors: BehaviorRegistry = DEFAULT_BEHAVIORS,
  ) {}

  /** Compile a strategy under a policy and keep the space; one that does not compile is answered with its report and kept nowhere. */
  async createSpace(input: {
    designRunId: string;
    strategy: unknown;
    policy: MemoryPolicy;
    policySource: string;
  }): Promise<{ space: MemorySpaceDto } | { report: CompileReportDto }> {
    const strategy = parseLenient(memoryStrategySchema, input.strategy);
    if (!strategy.ok) return { report: unreadable('strategy.unreadable', 'strategy').report };
    const { compiled, report } = compileSpace(strategy.value, input.policy, this.behaviors);
    if (compiled === null) return { report };
    const stored: StoredSpace = {
      id: this.ports.ids(),
      designRunId: input.designRunId,
      strategy: strategy.value,
      policy: input.policy,
      policySource: input.policySource,
      createdAt: this.ports.clock(),
    };
    await this.ports.spaces.insert(stored);
    return { space: spaceDto(stored, report) };
  }

  /** A space and its compile report — refused as not found, like every verb, when the space is not kept. */
  async getSpace(spaceId: string): Promise<MemorySpaceDto> {
    const stored = await this.stored(spaceId);
    return spaceDto(stored, this.compile(stored).report);
  }

  async remember(spaceId: string, request: Verb<typeof remember>): Promise<WriteResultDto> {
    return remember(await this.open(spaceId), request);
  }

  async update(spaceId: string, request: Verb<typeof update>): Promise<WriteResultDto> {
    return update(await this.open(spaceId), request);
  }

  async invalidate(spaceId: string, request: Verb<typeof invalidate>): Promise<MemoryRecordDto> {
    return invalidate(await this.open(spaceId), request);
  }

  async history(spaceId: string, request: Verb<typeof history>): Promise<MemoryRecordDto[]> {
    return history(await this.open(spaceId), request);
  }

  async recall(spaceId: string, request: Verb<typeof recall>): Promise<RecallResultDto> {
    return recall(await this.open(spaceId), request);
  }

  async consolidate(
    spaceId: string,
    request: Verb<typeof consolidate>,
  ): Promise<ConsolidationResultDto> {
    return consolidate(await this.open(spaceId), request);
  }

  /** Expire, unproject and project across every space. */
  sweep(): Promise<SweepReport> {
    return sweep(this.ports, this.behaviors);
  }

  private compile(stored: StoredSpace): CompileResult {
    const policy = memoryPolicySchema.safeParse(stored.policy);
    if (!policy.success) return unreadable('policy.unreadable', 'policy');
    const strategy = parseLenient(memoryStrategySchema, stored.strategy);
    if (!strategy.ok) return unreadable('strategy.unreadable', 'strategy');
    return compileSpace(strategy.value, policy.data, this.behaviors);
  }

  private async stored(spaceId: string): Promise<StoredSpace> {
    const stored = await this.ports.spaces.get(spaceId);
    if (stored === null) refuse('space.not_found', `no memory space ${spaceId}`);
    return stored;
  }

  private async open(spaceId: string): Promise<SpaceContext> {
    const stored = await this.stored(spaceId);
    const { compiled, report } = this.compile(stored);
    if (compiled === null) {
      refuse(
        'space.not_compiled',
        `memory space ${spaceId} does not compile: ${report.problems.map(({ code }) => code).join(', ')}`,
      );
    }
    return { ports: this.ports, spaceId, space: compiled };
  }
}

const spaceDto = (stored: StoredSpace, report: CompileReportDto): MemorySpaceDto => ({
  id: stored.id,
  designRunId: stored.designRunId,
  policySource: stored.policySource,
  createdAt: stored.createdAt.toISOString(),
  report,
});
