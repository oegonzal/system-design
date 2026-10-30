import { describe, expect, it } from 'vitest';

import { analyzeStrategy } from './executability';
import { REGISTER_KIND_DECLARATIONS, REGISTER_KINDS } from './register-kinds';
import type { MemoryStrategy } from './strategy';

type Register = MemoryStrategy['registers'][number];
type Operation = MemoryStrategy['interfaces'][number]['operation'];

const register = (
  name: string,
  kind: Register['kind'],
  term: Register['term'],
  metadata: string[] = [],
): Register => ({
  name,
  kind,
  term,
  holds: 'h',
  store: 's',
  scope: 'sc',
  metadata,
  lifecycle: 'l',
});
const iface = (operation: Operation, name: string) => ({
  operation,
  register: name,
  input: 'i',
  output: 'o',
  guarantee: 'g',
});
const step = (operation: Operation, name: string) => ({ operation, register: name, does: 'd' });

const declarations = (): Pick<MemoryStrategy, 'registers' | 'interfaces' | 'workflows'> => ({
  registers: [
    register('notes', 'working', 'short_term', ['task_id', 'kind=working']),
    register('episodes', 'episodic', 'long_term'),
    register('facts', 'semantic', 'long_term'),
    register('playbooks', 'procedural', 'long_term'),
    register('edges', 'relational', 'long_term'),
  ],
  interfaces: [
    iface('remember', 'notes'),
    iface('remember', 'episodes'),
    iface('recall', 'episodes'),
    iface('invalidate', 'episodes'),
    iface('consolidate', 'episodes'),
    iface('remember', 'facts'),
    iface('recall', 'facts'),
    iface('invalidate', 'facts'),
    iface('recall', 'playbooks'),
    iface('consolidate', 'playbooks'),
    iface('recall', 'edges'),
    iface('update', 'edges'),
  ],
  workflows: [
    {
      name: 'learn',
      kind: 'consolidation_promotion',
      steps: [
        step('consolidate', 'episodes'),
        step('remember', 'facts'),
        step('consolidate', 'playbooks'),
      ],
    },
  ],
});

describe('what the runtime can execute of a strategy', () => {
  it('[AGM-1] names episodes the evidence, semantic memory the lessons and procedures the playbooks', () => {
    expect(
      Object.fromEntries(
        REGISTER_KINDS.map((kind) => [kind, REGISTER_KIND_DECLARATIONS[kind].role]),
      ),
    ).toEqual({
      working: null,
      episodic: 'source',
      semantic: 'lesson',
      procedural: 'playbook',
      relational: null,
    });
  });

  it('[AGM-1] routes consolidation by role and states every part that cannot run, naming its register', () => {
    const analysis = analyzeStrategy(declarations());
    expect(analysis.consolidation).toEqual({
      sources: ['episodes'],
      lessons: 'facts',
      playbooks: 'playbooks',
    });
    expect(analysis.warnings.map(({ code, refs }) => [code, refs])).toEqual([
      ['metadata.not_a_field', ['register.1']],
      ['register.no_entry', ['register.5']],
      ['register.unforgettable', ['register.5']],
      ['register.unforgettable', ['register.4']],
      ['register.unread', ['register.1']],
    ]);
    expect(analysis.registers.find((r) => r.name === 'notes')?.metadataFields).toEqual(['task_id']);
  });

  it('[AGM-1] answers the same in any order', () => {
    const shuffled = declarations();
    shuffled.registers.reverse();
    shuffled.interfaces.reverse();
    shuffled.workflows.forEach((workflow) => workflow.steps.reverse());
    const strip = (analysis: ReturnType<typeof analyzeStrategy>) => ({
      ...analysis,
      registers: analysis.registers.map(({ ref: _ref, ...rest }) => rest),
      warnings: analysis.warnings.map(({ code, message }) => ({ code, message })),
    });
    expect(strip(analyzeStrategy(shuffled))).toEqual(strip(analyzeStrategy(declarations())));
  });
});
