import type { MemoryStrategy } from '@sysdesign/contracts';

import { DEFAULT_BEHAVIORS } from '../kinds/behaviors';
import { GOLDEN_STRATEGY, present, strategyFixture, TEST_POLICY } from '../testing/fixtures';
import { compileSpace } from './compile';

const compile = (strategy: MemoryStrategy) =>
  compileSpace(strategy, TEST_POLICY, DEFAULT_BEHAVIORS);
const codes = (strategy: MemoryStrategy) =>
  compile(strategy).report.warnings.map(({ code, message }) => ({ code, message }));

/** Every prose field a strategy carries, rewritten — the typed declarations left exactly as they were. */
function rewriteProse(strategy: MemoryStrategy): MemoryStrategy {
  const other = (text: string) => `rewritten: ${text.split('').reverse().join('')}`;
  return {
    summary: other(strategy.summary),
    assumptions: strategy.assumptions.map(other),
    registers: strategy.registers.map((register) => ({
      ...register,
      holds: other(register.holds),
      store: other(register.store),
      scope: other(register.scope),
      lifecycle: other(register.lifecycle),
    })),
    interfaces: strategy.interfaces.map((iface) => ({
      ...iface,
      input: other(iface.input),
      output: other(iface.output),
      guarantee: other(iface.guarantee),
    })),
    workflows: strategy.workflows.map((workflow) => ({
      ...workflow,
      name: other(workflow.name),
      steps: workflow.steps.map((step) => ({ ...step, does: other(step.does) })),
    })),
    safeguards: strategy.safeguards.map((safeguard) => ({
      rule: other(safeguard.rule),
      mechanism: other(safeguard.mechanism),
    })),
    tradeoffs: strategy.tradeoffs.map((tradeoff) => ({
      decision: other(tradeoff.decision),
      rationale: other(tradeoff.rationale),
      alternative: tradeoff.alternative === null ? null : other(tradeoff.alternative),
    })),
    risks: strategy.risks.map((risk) => ({
      risk: other(risk.risk),
      mitigation: other(risk.mitigation),
    })),
  };
}

/** The declarations in another order: registers, interfaces, workflows and each workflow's steps reversed. */
const reordered = (strategy: MemoryStrategy): MemoryStrategy => ({
  ...strategy,
  registers: [...strategy.registers].reverse(),
  interfaces: [...strategy.interfaces].reverse(),
  workflows: [...strategy.workflows]
    .reverse()
    .map((workflow) => ({ ...workflow, steps: [...workflow.steps].reverse() })),
});

describe('compiling a strategy into a space', () => {
  it('[AGM-1] compiles a strategy a model wrote into the route its typed declarations name, with what it cannot serve stated', () => {
    const { compiled, report } = compile(GOLDEN_STRATEGY);
    expect(report.problems).toEqual([]);
    expect(report.warnings.map(({ code, message }) => ({ code, message }))).toEqual([
      {
        code: 'metadata.not_a_field',
        message:
          'register working_state declares metadata "kind=working", which is not a field name, so it is not filterable',
      },
      {
        code: 'register.no_entry',
        message:
          'nothing can enter register relational_graph: it declares no remember and no consolidation writes it',
      },
      {
        code: 'register.unread',
        message:
          'register working_state declares no recall, so nothing reads it but the write that echoes it',
      },
    ]);
    expect(compiled?.consolidation).toEqual({
      sources: ['episodic_record'],
      lessons: 'semantic_fact',
      playbooks: 'procedural_playbook',
    });
    expect(compiled?.registers.get('working_state')?.ttlSeconds).toBe(600);
    expect(compiled?.registers.get('semantic_fact')?.ttlSeconds).toBeNull();
  });

  it('[AGM-1] compiles to the same space whatever the prose says', () => {
    for (const strategy of [GOLDEN_STRATEGY, strategyFixture()]) {
      expect(compile(rewriteProse(strategy))).toEqual(compile(strategy));
    }
  });

  it('[AGM-1] compiles to the same space in any order', () => {
    for (const strategy of [GOLDEN_STRATEGY, strategyFixture()]) {
      expect(compile(reordered(strategy)).compiled).toEqual(compile(strategy).compiled);
      expect(codes(reordered(strategy))).toEqual(codes(strategy));
    }
  });

  it('[AGM-1] leaves consolidation unavailable, naming the registers, when its lesson target is missing or ambiguous', () => {
    const none = strategyFixture();
    for (const workflow of none.workflows) {
      workflow.steps = workflow.steps.filter((step) => step.operation !== 'remember');
    }
    expect(compile(none).compiled?.consolidation).toBeNull();
    expect(codes(none).map(({ code }) => code)).toContain('consolidation.no_lesson_target');

    const two = strategyFixture();
    two.registers.push({ ...present(two.registers[1], 'the facts register'), name: 'more_facts' });
    two.interfaces.push({
      ...present(two.interfaces[1], 'remember on facts'),
      register: 'more_facts',
    });
    present(two.workflows[1], 'the consolidation workflow').steps.push({
      operation: 'remember',
      register: 'more_facts',
      does: 'a step',
    });
    expect(compile(two).compiled?.consolidation).toBeNull();
    expect(codes(two)).toContainEqual({
      code: 'consolidation.lessons_ambiguous',
      message: 'lessons could go to any of facts, more_facts',
    });
  });

  it('[AGM-1] creates no space from a dangling reference or a kind the runtime has no behavior for', () => {
    const dangling = strategyFixture();
    present(dangling.workflows[0], 'the recall workflow').steps.push({
      operation: 'recall',
      register: 'ghost',
      does: 'a step',
    });
    const broken = compile(dangling);
    expect(broken.compiled).toBeNull();
    expect(broken.report.problems.map(({ code }) => code)).toEqual(['step.unknown_register']);

    const { relational: _omitted, ...withoutRelations } = DEFAULT_BEHAVIORS;
    const unsupported = compileSpace(strategyFixture(), TEST_POLICY, withoutRelations);
    expect(unsupported.compiled).toBeNull();
    expect(unsupported.report.problems.map(({ code }) => code)).toEqual([
      'register.kind_unsupported',
    ]);
  });
});
