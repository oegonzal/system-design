import type { MemoryStrategy } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import type { TaskContract } from '../../core/contracts';
import { MEMORY_ARCHITECTURE } from './definition';
import { coverageValidator, executabilityValidator, referencesValidator } from './validators';

type Register = MemoryStrategy['registers'][number];
type Operation = MemoryStrategy['interfaces'][number]['operation'];

const contract = MEMORY_ARCHITECTURE.task as unknown as TaskContract<MemoryStrategy>;

const register = (
  name: string,
  kind: Register['kind'],
  term: Register['term'] = 'long_term',
): Register => ({
  name,
  kind,
  term,
  holds: `${kind} memory`,
  store: 'rows',
  scope: 'tenant',
  metadata: [],
  lifecycle: 'as declared',
});
const iface = (operation: Operation, name: string) => ({
  operation,
  register: name,
  input: 'in',
  output: 'out',
  guarantee: 'holds',
});
const step = (operation: Operation, name: string) => ({
  operation,
  register: name,
  does: 'a step',
});

/** A strategy every validator passes: facts and episodes written, read and forgotten; episodes promote to lessons. */
const sound = (): MemoryStrategy => ({
  summary: 'A memory service.',
  assumptions: [],
  registers: [register('facts', 'semantic'), register('episodes', 'episodic')],
  interfaces: [
    iface('remember', 'facts'),
    iface('recall', 'facts'),
    iface('invalidate', 'facts'),
    iface('remember', 'episodes'),
    iface('recall', 'episodes'),
    iface('invalidate', 'episodes'),
    iface('consolidate', 'episodes'),
  ],
  workflows: [
    {
      name: 'use',
      kind: 'recall_routing',
      steps: [
        step('remember', 'facts'),
        step('recall', 'facts'),
        step('invalidate', 'facts'),
        step('remember', 'episodes'),
        step('recall', 'episodes'),
        step('invalidate', 'episodes'),
      ],
    },
    {
      name: 'learn',
      kind: 'consolidation_promotion',
      steps: [step('consolidate', 'episodes'), step('remember', 'facts')],
    },
  ],
  safeguards: [],
  tradeoffs: [],
  risks: [],
});

const messages = (strategy: MemoryStrategy) =>
  executabilityValidator.validate(strategy, contract).problems.map((problem) => problem.message);

describe('the memory-architecture validators', () => {
  it('[QL-74] pass a strategy whose every reference resolves, every declaration is exercised, and every part can run', () => {
    for (const validator of [referencesValidator, coverageValidator]) {
      expect(validator.validate(sound(), contract).problems).toEqual([]);
    }
    // Its only executability note: no playbook register to promote lessons into.
    expect(messages(sound())).toEqual([
      'the agentic-memory runtime cannot run this as written: the consolidation workflow promotes lessons into no playbook register',
    ]);
  });

  it('[QL-74] block a reference to a register or an operation the strategy does not declare', () => {
    const dangling = sound();
    dangling.workflows[0]?.steps.push(step('update', 'facts'));
    const report = referencesValidator.validate(dangling, contract);
    expect(report.gate).toBe('block');
    expect(report.problems.map((problem) => problem.locationRefs)).toEqual([['workflow.1']]);
  });

  it('[QL-74] tell the coach, in the runtime’s words, what it cannot run: lessons kept beside their episodes, and memory nothing can forget', () => {
    const strategy = sound();
    // Lessons kept inside the episodic register, and facts forgotten by an update instead of an invalidate.
    strategy.interfaces = strategy.interfaces.filter(
      (i) => !(i.register === 'facts' && i.operation === 'invalidate'),
    );
    strategy.interfaces.push(iface('update', 'facts'));
    for (const workflow of strategy.workflows) {
      workflow.steps = workflow.steps
        .filter((s) => !(s.register === 'facts' && s.operation === 'invalidate'))
        .map((s) =>
          workflow.kind === 'consolidation_promotion' && s.register === 'facts'
            ? step('remember', 'episodes')
            : s,
        );
    }
    strategy.workflows[0]?.steps.push(step('update', 'facts'));
    const report = executabilityValidator.validate(strategy, contract);
    expect(report.gate).toBe('warn');
    expect(report.problems.every((problem) => problem.severity === 'medium')).toBe(true);
    expect(messages(strategy)).toEqual(
      expect.arrayContaining([
        'the agentic-memory runtime cannot run this as written: the consolidation workflow remembers its lessons in no register that keeps them',
        'the agentic-memory runtime cannot run this as written: register facts keeps long-term memory and declares no invalidate, so nothing it keeps can be forgotten',
      ]),
    );
    const unforgettable = report.problems.find((problem) =>
      problem.message.includes('register facts keeps'),
    );
    expect(unforgettable?.locationRefs).toEqual(['register.1']);
  });

  it('[QL-74] judge nothing of an artifact the schema cannot read — every rule runs only on a parsed strategy', () => {
    // `check` reads the artifact through the output schema before any rule runs and returns no
    // problems when it does not parse, so no rule ever iterates a field of the wrong type; the
    // schema's refusal is the schema validator's to report, not these validators'.
    const unreadable = { registers: 'not a list' } as unknown as MemoryStrategy;
    for (const validator of [referencesValidator, coverageValidator, executabilityValidator]) {
      expect(() => validator.validate(unreadable, contract)).not.toThrow();
      expect(validator.validate(unreadable, contract).problems).toEqual([]);
    }
  });
});
