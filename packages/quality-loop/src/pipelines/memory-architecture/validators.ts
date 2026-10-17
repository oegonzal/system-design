/**
 * The exact checks on a memory strategy, before any lens reads it. Both run on
 * every artifact the engine hands over, well-formed or not, so each starts from
 * the output schema, read the way the model seam reads a reply (a field past
 * its size is still well-formed); neither reads prose. The declared sets are
 * the strategy's OWN registers and interfaces — intra-artifact reference
 * integrity, the same shape the canvas runs over its graph, built from sibling
 * fields rather than a goal index.
 *
 * `references` blocks. An interface or a workflow step that names a register no
 * register declares, a step that invokes an operation no interface declares, or
 * a register declared twice (its references become ambiguous) — none can be
 * judged, and a coach that produced it fixes that before anything else.
 *
 * `structure` warns. A register no interface or workflow uses, and an interface
 * no workflow step exercises, are legal and judgeable, but every lens is told.
 */
import type { ValidationProblem, ValidationReport, ValidatorGate } from '@sysdesign/contracts';

import {
  problem,
  readArtifact,
  REFERENCES_VALIDATOR_ID,
  type TaskContract,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import type { MemoryStrategy } from './output';

const COVERAGE_VALIDATOR_ID = 'coverage';

type Rule = (strategy: MemoryStrategy) => ValidationProblem[];

/** One operation on one register, the handle a workflow step and an interface agree on. */
const op = (operation: string, register: string): string => `${operation}:${register}`;

function check(
  validatorId: string,
  gate: ValidatorGate,
  artifact: MemoryStrategy,
  contract: TaskContract<MemoryStrategy>,
  rule: Rule,
): ValidationReport {
  const parsed = readArtifact(contract.output.schema, artifact);
  if (!parsed.ok) return { validatorId, gate, problems: [] };
  return { validatorId, gate, problems: rule(parsed.value) };
}

const references: Rule = ({ registers, interfaces, workflows }) => {
  const problems: ValidationProblem[] = [];

  const declaredRegisters = new Set<string>();
  const firstByName = new Map<string, number>();
  registers.forEach((register, index) => {
    const first = firstByName.get(register.name);
    if (first === undefined) {
      firstByName.set(register.name, index);
      declaredRegisters.add(register.name);
    } else {
      problems.push(
        problem(
          'critical',
          `register ${register.name} is declared twice — references to it are ambiguous`,
          [`register.${first + 1}`, `register.${index + 1}`],
        ),
      );
    }
  });

  const declaredOps = new Set<string>();
  interfaces.forEach((iface, index) => {
    if (!declaredRegisters.has(iface.register)) {
      problems.push(
        problem(
          'critical',
          `interface ${op(iface.operation, iface.register)} names register ${iface.register}, which no register declares`,
          [`interface.${index + 1}`],
        ),
      );
    }
    declaredOps.add(op(iface.operation, iface.register));
  });

  workflows.forEach((workflow, index) => {
    const at = `workflow.${index + 1}`;
    workflow.steps.forEach((step) => {
      if (!declaredRegisters.has(step.register)) {
        problems.push(
          problem(
            'critical',
            `workflow ${workflow.name} step ${op(step.operation, step.register)} names register ${step.register}, which no register declares`,
            [at],
          ),
        );
      } else if (!declaredOps.has(op(step.operation, step.register))) {
        problems.push(
          problem(
            'critical',
            `workflow ${workflow.name} step ${op(step.operation, step.register)} invokes an operation no interface declares`,
            [at],
          ),
        );
      }
    });
  });

  return problems;
};

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
      workflow.steps.map((step) => op(step.operation, step.register)),
    ),
  );
  interfaces.forEach((iface, index) => {
    if (!usedOps.has(op(iface.operation, iface.register))) {
      problems.push(
        problem(
          'medium',
          `interface ${op(iface.operation, iface.register)} is named by no workflow step`,
          [`interface.${index + 1}`],
        ),
      );
    }
  });

  return problems;
};

export const referencesValidator: Validator<MemoryStrategy> = {
  id: REFERENCES_VALIDATOR_ID,
  gate: 'block',
  validate: (artifact, contract) =>
    check(REFERENCES_VALIDATOR_ID, 'block', artifact, contract, references),
};

export const coverageValidator: Validator<MemoryStrategy> = {
  id: COVERAGE_VALIDATOR_ID,
  gate: 'warn',
  validate: (artifact, contract) =>
    check(COVERAGE_VALIDATOR_ID, 'warn', artifact, contract, coverage),
};
