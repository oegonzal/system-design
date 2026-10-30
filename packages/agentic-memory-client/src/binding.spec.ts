import type {
  CompiledRegisterDto,
  MemorySpaceDto,
  OperationVerb,
  RegisterKind,
} from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import {
  bindMemorySpace,
  bindSpace,
  MemoryBindingRefused,
  memoryBindingSchema,
  type MemoryBinding,
} from './binding';
import type { MemoryClient } from './memory-client';

const SPACE_ID = '00000000-0000-4000-8000-0000000000a1';

/** A compiled register as the host's report lists one. */
const register = (
  name: string,
  kind: RegisterKind,
  operations: OperationVerb[],
  metadataFields: string[] = [],
): CompiledRegisterDto => ({
  name,
  kind,
  term: 'long_term',
  ttlSeconds: null,
  projected: true,
  operations,
  metadataFields,
});

/** A space that compiled with two registers and narrows its partition by one key, unless a case says otherwise. */
const space = (overrides: Partial<MemorySpaceDto> = {}): MemorySpaceDto => ({
  id: SPACE_ID,
  name: 'assistant',
  designRunId: 'run-1',
  policySource: 'spec',
  scopeKeys: ['tenant', 'unit'],
  createdAt: '2026-10-01T00:00:00.000Z',
  report: {
    problems: [],
    warnings: [],
    registers: [
      register('facts', 'semantic', ['recall']),
      register(
        'answers',
        'semantic',
        ['invalidate', 'recall', 'remember', 'update'],
        ['channel', 'question'],
      ),
    ],
    consolidation: null,
  },
  ...overrides,
});

/** The binding the fixture space serves, as a config file declares one. */
const DECLARED = {
  space: { name: 'assistant', runId: 'run-1' },
  scope: { partition: 'tenant', unit: 'unit' },
  registers: {
    fact: { name: 'facts', kind: 'semantic', operations: ['recall'] },
    answer: {
      name: 'answers',
      kind: 'semantic',
      operations: ['recall', 'remember'],
      metadata: ['question'],
    },
  },
  recovery: { windowMs: 0, pauseMs: 1 },
};

/** The declared binding, read as the schema reads a config file, with a part a case overrides. */
const binding = (overrides: Record<string, unknown> = {}): MemoryBinding =>
  memoryBindingSchema.parse({ ...DECLARED, ...overrides });

const accepts = (declared: unknown): boolean => memoryBindingSchema.safeParse(declared).success;

/** The refusal a bind raised, or a failure when it bound. */
const refusalOf = (bind: () => unknown): MemoryBindingRefused => {
  try {
    bind();
  } catch (error) {
    if (error instanceof MemoryBindingRefused) return error;
    throw error;
  }
  throw new Error('expected the binding to be refused');
};

describe('memoryBindingSchema', () => {
  it('[AMC-3] reads a binding as a config file declares it — the space and its run, the scope keys, each role to its register with kind, operations and metadata, the recovery — and a role that names no metadata fields names none', () => {
    const parsed = binding();
    expect(parsed.space).toEqual({ name: 'assistant', runId: 'run-1' });
    expect(parsed.scope).toEqual({ partition: 'tenant', unit: 'unit' });
    expect(parsed.registers).toEqual({
      fact: { name: 'facts', kind: 'semantic', operations: ['recall'], metadata: [] },
      answer: {
        name: 'answers',
        kind: 'semantic',
        operations: ['recall', 'remember'],
        metadata: ['question'],
      },
    });
    expect(parsed.recovery).toEqual({ windowMs: 0, pauseMs: 1 });
    expect(binding({ scope: { partition: 'tenant', unit: null } }).scope.unit).toBeNull();
  });

  it('[AMC-3] refuses a binding that names no register, a role or a field outside its grammar, a verb or a kind outside the vocabulary, a run or a name outside theirs, and a key it does not declare', () => {
    expect(accepts(DECLARED)).toBe(true);
    expect(accepts({ ...DECLARED, registers: {} })).toBe(false);
    const role = (name: string) => ({
      ...DECLARED,
      registers: { [name]: DECLARED.registers.fact },
    });
    expect(accepts(role('Fact'))).toBe(false);
    expect(accepts(role('profile fact'))).toBe(false);
    expect(accepts(role('profile-fact'))).toBe(true);
    const fact = (need: Record<string, unknown>) => ({
      ...DECLARED,
      registers: { fact: { ...DECLARED.registers.fact, ...need } },
    });
    expect(accepts(fact({ operations: [] }))).toBe(false);
    expect(accepts(fact({ operations: ['forget'] }))).toBe(false);
    expect(accepts(fact({ kind: 'vector' }))).toBe(false);
    expect(accepts(fact({ metadata: ['a field'] }))).toBe(false);
    expect(accepts(fact({ name: '' }))).toBe(false);
    expect(accepts(fact({ projected: true }))).toBe(false);
    expect(accepts({ ...DECLARED, scope: { partition: 'tenant-id', unit: null } })).toBe(false);
    expect(accepts({ ...DECLARED, space: { name: 'Assistant', runId: 'run-1' } })).toBe(false);
    expect(accepts({ ...DECLARED, space: { name: 'assistant', runId: '' } })).toBe(false);
    expect(accepts({ ...DECLARED, recovery: { windowMs: 0 } })).toBe(false);
    expect(accepts({ ...DECLARED, project: 'assistant' })).toBe(false);
  });
});

describe('bindSpace', () => {
  it('[AMC-3] binds a space that serves every declared need: each role to the name its requests carry, the scope as declared', () => {
    expect(bindSpace(space(), binding())).toEqual({
      spaceId: SPACE_ID,
      registers: { fact: 'facts', answer: 'answers' },
      scope: { partition: 'tenant', unit: 'unit' },
    });
    const unscoped = binding({ scope: { partition: 'tenant', unit: null } });
    expect(bindSpace(space({ scopeKeys: ['tenant'] }), unscoped).scope).toEqual({
      partition: 'tenant',
      unit: null,
    });
  });

  it('[AMC-3] a space that does not compile binds nothing: its problems lead the refusal, and the registers its report no longer carries follow', () => {
    const unreadable = space({
      report: {
        problems: [
          { code: 'strategy.unreadable', refs: [], message: 'the strategy no longer reads' },
        ],
        warnings: [],
        registers: [],
        consolidation: null,
      },
    });
    expect(refusalOf(() => bindSpace(unreadable, binding())).needs).toEqual([
      'the space does not compile: strategy.unreadable',
      'role fact: the space has no register facts',
      'role answer: the space has no register answers',
    ]);
  });

  it('[AMC-3] a register the space does not have is refused by role and by name', () => {
    const declared = binding({
      registers: {
        ...DECLARED.registers,
        story: { name: 'stories', kind: 'semantic', operations: ['recall'] },
      },
    });
    expect(refusalOf(() => bindSpace(space(), declared)).needs).toEqual([
      'role story: the space has no register stories',
    ]);
  });

  it('[AMC-3] a register of another kind than the role declares is refused', () => {
    const declared = binding({
      registers: { fact: { name: 'facts', kind: 'episodic', operations: ['recall'] } },
    });
    expect(refusalOf(() => bindSpace(space(), declared)).needs).toEqual([
      'role fact: register facts keeps semantic memory, not episodic',
    ]);
  });

  it('[AMC-3] an operation the register does not declare is refused, every undeclared verb named', () => {
    const declared = binding({
      registers: {
        fact: { name: 'facts', kind: 'semantic', operations: ['recall', 'remember', 'update'] },
      },
    });
    expect(refusalOf(() => bindSpace(space(), declared)).needs).toEqual([
      'role fact: register facts declares no remember, update',
    ]);
  });

  it('[AMC-3] a metadata field the register does not declare is refused by name', () => {
    const declared = binding({
      registers: {
        answer: {
          name: 'answers',
          kind: 'semantic',
          operations: ['recall'],
          metadata: ['question', 'source'],
        },
      },
    });
    expect(refusalOf(() => bindSpace(space(), declared)).needs).toEqual([
      'role answer: register answers declares no metadata field source',
    ]);
  });

  it("[AMC-3] the partition every request names is the space's first scope key, and a space declaring none serves no binding", () => {
    const declared = binding({ scope: { partition: 'user', unit: 'unit' } });
    expect(refusalOf(() => bindSpace(space(), declared)).needs).toEqual([
      'the partition every request must name is tenant, not user',
    ]);
    expect(refusalOf(() => bindSpace(space({ scopeKeys: [] }), binding())).needs).toEqual([
      'the space declares no scope keys',
    ]);
  });

  it('[AMC-3] the unit key is one the space narrows by: a declared key after the partition, never the partition itself', () => {
    const narrowedBy = (unit: string, scopeKeys: string[]) =>
      refusalOf(() =>
        bindSpace(space({ scopeKeys }), binding({ scope: { partition: 'tenant', unit } })),
      ).needs;
    expect(narrowedBy('account', ['tenant', 'unit'])).toEqual([
      'the space narrows by unit, not by account',
    ]);
    expect(narrowedBy('tenant', ['tenant', 'unit'])).toEqual([
      'the space narrows by unit, not by tenant',
    ]);
    expect(narrowedBy('unit', ['tenant'])).toEqual(['the space narrows by no key, not by unit']);
  });

  it('[AMC-3] every unmet need is collected before the one refusal, listed by role and by name in the message', () => {
    const declared = binding({
      scope: { partition: 'user', unit: 'unit' },
      registers: {
        fact: { name: 'facts', kind: 'semantic', operations: ['recall', 'remember'] },
        story: { name: 'stories', kind: 'semantic', operations: ['recall'] },
      },
    });
    const refused = refusalOf(() => bindSpace(space(), declared));
    expect(refused.name).toBe('MemoryBindingRefused');
    expect(refused.spaceId).toBe(SPACE_ID);
    expect(refused.needs).toEqual([
      'role fact: register facts declares no remember',
      'role story: the space has no register stories',
      'the partition every request must name is tenant, not user',
    ]);
    expect(refused.message).toBe(
      'memory space assistant does not serve the binding: ' + refused.needs.join('; '),
    );
    // A space with no name is named by its id.
    expect(refusalOf(() => bindSpace(space({ name: null }), declared)).message).toContain(
      `memory space ${SPACE_ID} does not serve`,
    );
  });
});

describe('bindMemorySpace', () => {
  /** A client that answers every ensure with one space and records what it was asked. */
  const ensuring = (answered: MemorySpaceDto) => {
    const calls: { name: string; request: unknown }[] = [];
    const client: Pick<MemoryClient, 'ensureSpace'> = {
      ensureSpace: (name, request) => {
        calls.push({ name, request });
        return Promise.resolve({ space: answered, created: true });
      },
    };
    return { client, calls };
  };

  it('[AMC-3] ensures the declared space once, from the declared run, and binds the space the host answered', async () => {
    const { client, calls } = ensuring(space());
    expect(await bindMemorySpace(client, binding())).toEqual({
      spaceId: SPACE_ID,
      registers: { fact: 'facts', answer: 'answers' },
      scope: { partition: 'tenant', unit: 'unit' },
    });
    expect(calls).toEqual([{ name: 'assistant', request: { runId: 'run-1' } }]);
  });

  it('[AMC-3] a space the host ensured that does not serve the binding is refused before the agent starts', async () => {
    const { client } = ensuring(space({ scopeKeys: ['tenant'] }));
    await expect(bindMemorySpace(client, binding())).rejects.toThrow(MemoryBindingRefused);
  });

  it("[AMC-3] takes what an agent needs of the space beyond its binding, read off the space the host answered, and collects it into the one refusal after the binding's own needs", async () => {
    const needsProject = (answered: MemorySpaceDto): string[] =>
      answered.scopeKeys.includes('project') ? [] : ['the space declares no scope key project'];
    const served = ensuring(space({ scopeKeys: ['tenant', 'project', 'unit'] }));
    await expect(bindMemorySpace(served.client, binding(), needsProject)).resolves.toMatchObject({
      spaceId: SPACE_ID,
    });
    const refused = await bindMemorySpace(
      ensuring(space({ scopeKeys: ['tenant'] })).client,
      binding(),
      needsProject,
    ).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(MemoryBindingRefused);
    expect((refused as MemoryBindingRefused).needs).toEqual([
      'the space narrows by no key, not by unit',
      'the space declares no scope key project',
    ]);
  });
});
