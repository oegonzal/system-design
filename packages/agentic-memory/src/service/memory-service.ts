/**
 * The Memory Service: the typed API a host serves over its spaces. A space is
 * compiled on every load from the strategy and policy it keeps — compile is
 * pure and cheap, so nothing is cached and nothing goes stale — and a space
 * whose snapshot no longer reads, or no longer compiles, answers every verb
 * with `space.not_compiled`. Which verbs a register serves is the strategy's
 * declaration, enforced on every call; a writer is briefed from the same load,
 * before it writes. A space may be ensured under a name: the same name from
 * the same run is the same space, and another run's claim on it is refused.
 */
import {
  memoryStrategySchema,
  parseLenient,
  type CompileProblem,
  type CompileReportDto,
  type ConsolidationResultDto,
  type EnsuredSpaceDto,
  type MemoryRecordDto,
  type MemorySpaceDto,
  type MemoryStrategy,
  type RecallResultDto,
  type RecordScope,
  type SpaceWriteBriefDto,
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
import { writeBrief } from '../write/brief';
import { history, invalidate, remember, update, type SpaceContext } from '../write/write';

type Verb<F extends (ctx: SpaceContext, request: never) => unknown> = Parameters<F>[1];

/** What a space is made from: the run's strategy, the policy every new space snapshots, and the settings it came from. */
interface SpaceInput {
  designRunId: string;
  strategy: unknown;
  policy: MemoryPolicy;
  policySource: string;
}

/**
 * What a space would be made from were its name free: the strategy read only
 * then — a host reads it from a loop run, which the space that exists under
 * the name is answered without.
 */
interface SpaceSource extends Omit<SpaceInput, 'strategy'> {
  strategy: () => Promise<unknown>;
}

/** What was made, or the compile report that says why nothing was. */
type Made<T> = T | { report: CompileReportDto };

/**
 * A kept snapshot compiled: the strategy it holds and what that compiles to
 * under its policy — or nothing, when either no longer reads, with the report
 * that says which — and the kept policy's scope keys, none when it does not read.
 */
type CompiledSnapshot = (
  | (CompileResult & { strategy: MemoryStrategy })
  | { strategy: null; compiled: null; report: CompileReportDto }
) & { scopeKeys: readonly string[] };

/** A space opened for a verb: what its snapshot compiles to, and the strategy that snapshot holds. */
interface OpenSpace extends SpaceContext {
  strategy: MemoryStrategy;
}

const unreadable = (
  code: Extract<CompileProblem, 'strategy.unreadable' | 'policy.unreadable'>,
  what: string,
): CompileReportDto => ({
  problems: [{ code, refs: [], message: `the space's ${what} no longer reads` }],
  warnings: [],
  registers: [],
  consolidation: null,
});

export class MemoryService {
  constructor(
    private readonly ports: MemoryPorts,
    private readonly behaviors: BehaviorRegistry = DEFAULT_BEHAVIORS,
  ) {}

  /**
   * Compile a strategy under a policy and keep the space, under `name` when
   * there is one; one that does not compile is answered with its report and
   * kept nowhere, and a name another space holds is refused.
   */
  async createSpace(
    input: SpaceInput & { name: string | null },
  ): Promise<Made<{ space: MemorySpaceDto }>> {
    const strategy = parseLenient(memoryStrategySchema, input.strategy);
    if (!strategy.ok) return { report: unreadable('strategy.unreadable', 'strategy') };
    const { compiled, report } = compileSpace(strategy.value, input.policy, this.behaviors);
    if (compiled === null) return { report };
    const stored: StoredSpace = {
      id: this.ports.ids(),
      name: input.name,
      designRunId: input.designRunId,
      strategy: strategy.value,
      policy: input.policy,
      policySource: input.policySource,
      createdAt: this.ports.clock(),
    };
    if ((await this.ports.spaces.insert(stored)) === 'name_taken') {
      refuse('space.name_taken', `a memory space named ${input.name} exists already`);
    }
    return { space: spaceDto(stored, report, input.policy.scopeKeys) };
  }

  /**
   * The space under a name: the one that run made, when it is there — its
   * strategy never read; made from the run, when none holds the name; refused
   * when another run's does. A claim that loses the race to another is refused
   * the same way.
   */
  async ensureSpace(input: SpaceSource & { name: string }): Promise<Made<EnsuredSpaceDto>> {
    const found = await this.ports.spaces.findByName(input.name);
    if (found === null) {
      const made = await this.createSpace({ ...input, strategy: await input.strategy() });
      return 'report' in made ? made : { space: made.space, created: true };
    }
    if (found.designRunId !== input.designRunId) {
      refuse(
        'space.name_taken',
        `memory space ${input.name} was made from run ${found.designRunId}, not run ${input.designRunId}`,
      );
    }
    return { space: this.describe(found), created: false };
  }

  /** A space and its compile report — refused as not found, like every verb, when the space is not kept. */
  async getSpace(spaceId: string): Promise<MemorySpaceDto> {
    return this.describe(await this.stored(spaceId));
  }

  async getSpaceByName(name: string): Promise<MemorySpaceDto> {
    const stored = await this.ports.spaces.findByName(name);
    if (stored === null) refuse('space.not_found', `no memory space named ${name}`);
    return this.describe(stored);
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

  /**
   * What a writer may remember into, and how each register files a memory —
   * refused, as a write is, for a space not kept or not compiling and for a
   * scope its policy does not declare. Writes nothing.
   */
  async writeBrief(spaceId: string, scope: RecordScope): Promise<SpaceWriteBriefDto> {
    const { space, strategy } = await this.open(spaceId);
    return writeBrief(space, strategy, scope);
  }

  /** Expire, unproject and project across every space. */
  sweep(): Promise<SweepReport> {
    return sweep(this.ports, this.behaviors);
  }

  /** A kept space as the wire carries it, its report and scope keys compiled again from the snapshots it keeps. */
  private describe(stored: StoredSpace): MemorySpaceDto {
    const snapshot = this.compile(stored);
    return spaceDto(stored, snapshot.report, snapshot.scopeKeys);
  }

  private compile(stored: StoredSpace): CompiledSnapshot {
    const policy = memoryPolicySchema.safeParse(stored.policy);
    if (!policy.success) {
      return {
        strategy: null,
        compiled: null,
        scopeKeys: [],
        report: unreadable('policy.unreadable', 'policy'),
      };
    }
    const { scopeKeys } = policy.data;
    const strategy = parseLenient(memoryStrategySchema, stored.strategy);
    if (!strategy.ok) {
      return {
        strategy: null,
        compiled: null,
        scopeKeys,
        report: unreadable('strategy.unreadable', 'strategy'),
      };
    }
    return {
      ...compileSpace(strategy.value, policy.data, this.behaviors),
      strategy: strategy.value,
      scopeKeys,
    };
  }

  private async stored(spaceId: string): Promise<StoredSpace> {
    const stored = await this.ports.spaces.get(spaceId);
    if (stored === null) refuse('space.not_found', `no memory space ${spaceId}`);
    return stored;
  }

  private async open(spaceId: string): Promise<OpenSpace> {
    const snapshot = this.compile(await this.stored(spaceId));
    if (snapshot.compiled === null) {
      refuse(
        'space.not_compiled',
        `memory space ${spaceId} does not compile: ${snapshot.report.problems.map(({ code }) => code).join(', ')}`,
      );
    }
    return { ports: this.ports, spaceId, space: snapshot.compiled, strategy: snapshot.strategy };
  }
}

const spaceDto = (
  stored: StoredSpace,
  report: CompileReportDto,
  scopeKeys: readonly string[],
): MemorySpaceDto => ({
  id: stored.id,
  name: stored.name,
  designRunId: stored.designRunId,
  policySource: stored.policySource,
  scopeKeys: [...scopeKeys],
  createdAt: stored.createdAt.toISOString(),
  report,
});
