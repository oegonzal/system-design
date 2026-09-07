/**
 * The exact checks: what the index says against what the digest cites. Both
 * run on every artifact the engine hands over, well-formed or not, so each
 * starts from the output schema; neither reads prose. Both block: a digest
 * that rests on evidence the record never held, or leaves evidence unplaced,
 * cannot be trusted by any lens.
 */
import type { Severity, ValidationProblem, ValidationReport } from '@sysdesign/contracts';

import type { TaskContract } from '../../core/contracts';
import type { Validator } from '../../core/ports';
import { EXPERIENCE_DIGEST_ID, readIndex, type ExperienceIndex } from './input';
import type { ExperienceDigest } from './output';

export const REFERENCES_VALIDATOR_ID = 'references';
export const LIMITS_VALIDATOR_ID = 'limits';

type Rule = (digest: ExperienceDigest, index: ExperienceIndex) => ValidationProblem[];

const problem = (
  severity: Severity,
  message: string,
  locationRefs: string[] = [],
): ValidationProblem => ({ severity, locationRefs, message });

const placements = (digest: ExperienceDigest): string[] => [
  ...digest.memories.flatMap((memory) => memory.evidence),
  ...digest.unused,
];

function check(
  validatorId: string,
  artifact: ExperienceDigest,
  contract: TaskContract<ExperienceDigest>,
  rule: Rule,
  whenNoIndex: ValidationProblem[],
): ValidationReport {
  const parsed = contract.output.schema.safeParse(artifact);
  if (!parsed.success) return { validatorId, gate: 'block', problems: [] };
  const index = readIndex(contract.goal);
  const problems = index === null ? whenNoIndex : rule(parsed.data, index);
  return { validatorId, gate: 'block', problems };
}

const references: Rule = (digest, index) => {
  const known = new Set(index.evidence.map((item) => item.alias));
  const seen = new Set<string>();
  const problems: ValidationProblem[] = [];
  for (const alias of placements(digest)) {
    if (!known.has(alias)) problems.push(problem('critical', `${alias} is not listed evidence`));
    else if (seen.has(alias))
      problems.push(problem('critical', `${alias} is placed more than once`, [alias]));
    seen.add(alias);
  }
  return problems;
};

const limits: Rule = (digest, index) => {
  const placed = new Set(placements(digest));
  const problems = index.evidence
    .filter((item) => !placed.has(item.alias))
    .map((item) => problem('high', `${item.alias} is neither used nor listed as unused`));
  if (digest.memories.length > index.maxMemories) {
    problems.push(
      problem(
        'high',
        `${digest.memories.length} memories proposed; the limit is ${index.maxMemories}`,
      ),
    );
  }
  return problems;
};

export const referencesValidator: Validator<ExperienceDigest> = {
  id: REFERENCES_VALIDATOR_ID,
  gate: 'block',
  validate: (artifact, contract) =>
    check(REFERENCES_VALIDATOR_ID, artifact, contract, references, [
      problem('critical', `the goal carries no ${EXPERIENCE_DIGEST_ID} index`),
    ]),
};

export const limitsValidator: Validator<ExperienceDigest> = {
  id: LIMITS_VALIDATOR_ID,
  gate: 'block',
  validate: (artifact, contract) => check(LIMITS_VALIDATOR_ID, artifact, contract, limits, []),
};
