import { describe, expect, it } from 'vitest';

import type { MemoryStrategy } from './strategy';
import { validateStrategyReferences } from './strategy-validator';

type References = Pick<MemoryStrategy, 'registers' | 'interfaces' | 'workflows'>;

const register = (name: string): MemoryStrategy['registers'][number] => ({
  name,
  kind: 'semantic',
  term: 'long_term',
  holds: 'facts',
  store: 'rows',
  scope: 'tenant',
  metadata: [],
  lifecycle: 'supersede',
});
const iface = (
  operation: MemoryStrategy['interfaces'][number]['operation'],
  name: string,
): MemoryStrategy['interfaces'][number] => ({
  operation,
  register: name,
  input: 'in',
  output: 'out',
  guarantee: 'holds',
});
const workflow = (
  steps: [MemoryStrategy['interfaces'][number]['operation'], string][],
): MemoryStrategy['workflows'][number] => ({
  name: 'flow',
  kind: 'recall_routing',
  steps: steps.map(([operation, name]) => ({ operation, register: name, does: 'does' })),
});

const sound = (): References => ({
  registers: [register('facts')],
  interfaces: [iface('recall', 'facts'), iface('remember', 'facts')],
  workflows: [
    workflow([
      ['recall', 'facts'],
      ['remember', 'facts'],
    ]),
  ],
});

describe('the memory strategy reference rule', () => {
  it('finds nothing wrong with a strategy whose every reference resolves', () => {
    expect(validateStrategyReferences(sound())).toEqual([]);
  });

  it('names each dangling reference by its code and the places it sits', () => {
    const strategy = sound();
    strategy.registers.push(register('facts'));
    strategy.interfaces.push(iface('recall', 'ghost'));
    strategy.workflows.push(
      workflow([
        ['recall', 'nowhere'],
        ['update', 'facts'],
      ]),
    );
    expect(validateStrategyReferences(strategy).map(({ code, refs }) => ({ code, refs }))).toEqual([
      { code: 'register.duplicate', refs: ['register.1', 'register.2'] },
      { code: 'interface.unknown_register', refs: ['interface.3'] },
      { code: 'step.unknown_register', refs: ['workflow.2'] },
      { code: 'step.undeclared_operation', refs: ['workflow.2'] },
    ]);
  });
});
