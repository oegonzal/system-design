/**
 * The exact checks on a memory strategy, before any lens reads it. Both run on
 * every artifact the engine hands over, well-formed or not, so each starts from
 * the output schema, read the way the model seam reads a reply (a field past
 * its size is still well-formed); neither reads prose. The declared sets are
 * the strategy's OWN registers and interfaces — intra-artifact reference
 * integrity, built from sibling fields rather than a goal index.
 *
 * `references` blocks. Its rule is the contract's (`validateStrategyReferences`),
 * shared with the agentic-memory runtime that compiles a space from the same
 * strategy: an interface or a step naming a register no register declares, a
 * step invoking an operation no interface declares, or a register declared
 * twice — none can be judged, and a coach that produced it fixes that first.
 *
 * `coverage` warns. A register no interface or workflow uses, and an interface
 * no workflow step exercises, are legal and judgeable, but every lens is told.
 *
 * `executability` warns. What the agentic-memory runtime cannot run as written
 * — a consolidation it cannot route, a register nothing can write, read or
 * forget, a consolidate with no effect, metadata that is not a field — by the
 * runtime's own analysis (`analyzeStrategy`, shared through the contracts), so
 * the strategy a coach writes is the strategy the runtime executes. A warning a
 * producer is asked to act on, in the runtime's words, and every lens reads it.
 */
import {
  analyzeStrategy,
  operationHandle,
  validateStrategyReferences,
  type MemoryStrategy,
  type ValidationProblem,
} from '@sysdesign/contracts';

import { artifactValidator, problem, REFERENCES_VALIDATOR_ID } from '../../core/contracts';
import type { Validator } from '../../core/ports';

const COVERAGE_VALIDATOR_ID = 'coverage';
const EXECUTABILITY_VALIDATOR_ID = 'executability';

type Rule = (strategy: MemoryStrategy) => ValidationProblem[];

const references: Rule = (strategy) =>
  validateStrategyReferences(strategy).map((fault) =>
    problem('critical', fault.message, fault.refs),
  );

const coverage: Rule = ({ registers, interfaces, workflows }) => {
  const problems: ValidationProblem[] = [];

  const usedRegisters = new Set<string>([
    ...interfaces.map((iface) => iface.register),
    ...workflows.flatMap((workflow) => workflow.steps.map((step) => step.register)),
  ]);
  registers.forEach((register, index) => {
    if (!usedRegisters.has(register.name)) {
      problems.push(
        problem('medium', `register ${register.name} is used by no interface or workflow step`, [
          `register.${index + 1}`,
        ]),
      );
    }
  });

  const usedOps = new Set<string>(
    workflows.flatMap((workflow) =>
      workflow.steps.map((step) => operationHandle(step.operation, step.register)),
    ),
  );
  interfaces.forEach((iface, index) => {
    if (!usedOps.has(operationHandle(iface.operation, iface.register))) {
      problems.push(
        problem(
          'medium',
          `interface ${operationHandle(iface.operation, iface.register)} is named by no workflow step`,
          [`interface.${index + 1}`],
        ),
      );
    }
  });

  return problems;
};

const executability: Rule = (strategy) =>
  analyzeStrategy(strategy).warnings.map((warning) =>
    problem(
      'medium',
      `the agentic-memory runtime cannot run this as written: ${warning.message}`,
      warning.refs,
    ),
  );

export const referencesValidator: Validator<MemoryStrategy> = artifactValidator(
  REFERENCES_VALIDATOR_ID,
  'block',
  references,
);

export const coverageValidator: Validator<MemoryStrategy> = artifactValidator(
  COVERAGE_VALIDATOR_ID,
  'warn',
  coverage,
);

export const executabilityValidator: Validator<MemoryStrategy> = artifactValidator(
  EXECUTABILITY_VALIDATOR_ID,
  'warn',
  executability,
);
