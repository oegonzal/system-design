/**
 * The exact checks: what the index says against what the pack cites. Both
 * run on every artifact the engine hands over, well-formed or not, so each
 * starts from the output schema; neither reads prose. Both block: a pack that
 * cites what was never recalled, or leaves a candidate unjudged, cannot be
 * trusted by any lens.
 */
import type { Severity, ValidationProblem, ValidationReport } from '@sysdesign/contracts';

import type { TaskContract } from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { MEMORY_RECALL_ID, readIndex, type MemoryIndex } from './input';
import type { MemoryPack } from './output';

export const REFERENCES_VALIDATOR_ID = 'references';
export const LIMITS_VALIDATOR_ID = 'limits';

type Rule = (pack: MemoryPack, index: MemoryIndex) => ValidationProblem[];

const problem = (
  severity: Severity,
  message: string,
  locationRefs: string[] = [],
): ValidationProblem => ({ severity, locationRefs, message });

const verdicts = (pack: MemoryPack): string[] => [
  ...pack.kept.map((item) => item.chunk),
  ...pack.dropped.map((item) => item.chunk),
];

/** A well-formed pack and a readable index, or the problems that stand in the way. */
function check(
  validatorId: string,
  artifact: MemoryPack,
  contract: TaskContract<MemoryPack>,
  rule: Rule,
  whenNoIndex: ValidationProblem[],
): ValidationReport {
  const parsed = contract.output.schema.safeParse(artifact);
  if (!parsed.success) return { validatorId, gate: 'block', problems: [] };
  const index = readIndex(contract.goal);
  const problems = index === null ? whenNoIndex : rule(parsed.data, index);
  return { validatorId, gate: 'block', problems };
}

const references: Rule = (pack, index) => {
  const known = new Set(index.candidates.map((candidate) => candidate.alias));
  const seen = new Set<string>();
  const problems: ValidationProblem[] = [];
  for (const alias of verdicts(pack)) {
    if (!known.has(alias)) problems.push(problem('critical', `${alias} is not a listed candidate`));
    else if (seen.has(alias))
      problems.push(problem('critical', `${alias} is given more than one verdict`, [alias]));
    seen.add(alias);
  }
  return problems;
};

const limits: Rule = (pack, index) => {
  const given = new Set(verdicts(pack));
  const problems = index.candidates
    .filter((candidate) => !given.has(candidate.alias))
    .map((candidate) => problem('high', `${candidate.alias} has no verdict`));
  if (pack.kept.length > index.maxKept) {
    problems.push(
      problem('high', `${pack.kept.length} chunks kept; the limit is ${index.maxKept}`),
    );
  }
  return problems;
};

export const referencesValidator: Validator<MemoryPack> = {
  id: REFERENCES_VALIDATOR_ID,
  gate: 'block',
  validate: (artifact, contract) =>
    check(REFERENCES_VALIDATOR_ID, artifact, contract, references, [
      problem('critical', `the goal carries no ${MEMORY_RECALL_ID} index`),
    ]),
};

export const limitsValidator: Validator<MemoryPack> = {
  id: LIMITS_VALIDATOR_ID,
  gate: 'block',
  validate: (artifact, contract) => check(LIMITS_VALIDATOR_ID, artifact, contract, limits, []),
};
