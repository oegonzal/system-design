/**
 * The reference integrity of a memory strategy: every register a reference
 * names is declared, and declared once, and every workflow step invokes an
 * operation an interface declares on that register. A dangling reference can
 * neither be judged nor executed, so one rule serves both readers — the
 * memory-architecture pipeline, as the validator that blocks a coach's draft,
 * and the agentic-memory runtime, which compiles a space from a run's best
 * strategy and does not take a lenient read on the word of the run's
 * validators. The refs name the strategy's own numbered places
 * (`register.N`, `interface.N`, `workflow.N`).
 */
import type { MemoryStrategy } from './strategy';

export const STRATEGY_FAULTS = [
  'register.duplicate',
  'interface.unknown_register',
  'step.unknown_register',
  'step.undeclared_operation',
] as const;
export type StrategyFault = (typeof STRATEGY_FAULTS)[number];

export interface StrategyReferenceFault {
  code: StrategyFault;
  message: string;
  refs: string[];
}

/** One operation on one register: the handle a workflow step and an interface agree on. */
export const operationHandle = (operation: string, register: string): string =>
  `${operation}:${register}`;

export function validateStrategyReferences({
  registers,
  interfaces,
  workflows,
}: Pick<MemoryStrategy, 'registers' | 'interfaces' | 'workflows'>): StrategyReferenceFault[] {
  const faults: StrategyReferenceFault[] = [];

  const declaredRegisters = new Set<string>();
  const firstByName = new Map<string, number>();
  registers.forEach((register, index) => {
    const first = firstByName.get(register.name);
    if (first === undefined) {
      firstByName.set(register.name, index);
      declaredRegisters.add(register.name);
      return;
    }
    faults.push({
      code: 'register.duplicate',
      message: `register ${register.name} is declared twice — references to it are ambiguous`,
      refs: [`register.${first + 1}`, `register.${index + 1}`],
    });
  });

  const declaredOperations = new Set<string>();
  interfaces.forEach((iface, index) => {
    const handle = operationHandle(iface.operation, iface.register);
    if (!declaredRegisters.has(iface.register)) {
      faults.push({
        code: 'interface.unknown_register',
        message: `interface ${handle} names register ${iface.register}, which no register declares`,
        refs: [`interface.${index + 1}`],
      });
    }
    declaredOperations.add(handle);
  });

  workflows.forEach((workflow, index) => {
    const at = `workflow.${index + 1}`;
    workflow.steps.forEach((step) => {
      const handle = operationHandle(step.operation, step.register);
      if (!declaredRegisters.has(step.register)) {
        faults.push({
          code: 'step.unknown_register',
          message: `workflow ${workflow.name} step ${handle} names register ${step.register}, which no register declares`,
          refs: [at],
        });
      } else if (!declaredOperations.has(handle)) {
        faults.push({
          code: 'step.undeclared_operation',
          message: `workflow ${workflow.name} step ${handle} invokes an operation no interface declares`,
          refs: [at],
        });
      }
    });
  });

  return faults;
}
