/**
 * The exact checks on a canvas, before any lens reads it. Both run on every
 * artifact the engine hands over, well-formed or not, so each starts from the
 * output schema; neither reads prose.
 *
 * `references` blocks. An edge to a node that is not there, a carry naming an
 * operation neither endpoint declares, a brief bound to a criterion the
 * contract never listed or to a node the canvas does not hold, a path that
 * does not connect — none of it can be judged, and a coach that produced it
 * is asked to fix that before anything else. The checks are the same three
 * the studio runs on a submission, from `@sysdesign/contracts`, so what the
 * studio refuses and what the loop blocks cannot differ.
 *
 * `structure` warns. A node no edge touches and two edges saying the same
 * thing are legal and judgeable, but every lens is told they are there.
 */
import {
  validateBriefReferences,
  validateGraphReferences,
  validateNarration,
  type Severity,
  type ValidationProblem,
  type ValidationReport,
  type ValidatorGate,
} from '@sysdesign/contracts';

import type { TaskContract } from '../../core/contracts';
import type { Validator } from '../../core/ports';
import type { CanvasSubmission } from './output';

export const REFERENCES_VALIDATOR_ID = 'references';
export const STRUCTURE_VALIDATOR_ID = 'structure';

type Rule = (
  submission: CanvasSubmission,
  contract: TaskContract<CanvasSubmission>,
) => ValidationProblem[];

const problem = (
  severity: Severity,
  message: string,
  locationRefs: string[] = [],
): ValidationProblem => ({ severity, locationRefs, message });

function check(
  validatorId: string,
  gate: ValidatorGate,
  artifact: CanvasSubmission,
  contract: TaskContract<CanvasSubmission>,
  rule: Rule,
): ValidationReport {
  // An ill-formed artifact is the schema validator's to report, once.
  const parsed = contract.output.schema.safeParse(artifact);
  if (!parsed.success) return { validatorId, gate, problems: [] };
  return { validatorId, gate, problems: rule(parsed.data, contract) };
}

const references: Rule = ({ graph, brief, narrative }, contract) =>
  [
    ...validateGraphReferences(graph),
    ...(brief === null ? [] : validateBriefReferences(graph, brief, contract.criteria)),
    ...(narrative === null ? [] : validateNarration(graph, narrative, contract.criteria)),
  ].map((message) => problem('critical', message));

const structure: Rule = ({ graph }) => {
  const problems: ValidationProblem[] = [];
  const touched = new Set(graph.edges.flatMap((edge) => [edge.source, edge.target]));
  graph.nodes.forEach((node, index) => {
    if (!touched.has(node.id)) {
      problems.push(
        problem('medium', `node ${node.id} is connected to nothing`, [`node.${index + 1}`]),
      );
    }
  });
  const firstByShape = new Map<string, number>();
  graph.edges.forEach((edge, index) => {
    const shape = `${edge.source}>${edge.target}:${edge.kind}`;
    const first = firstByShape.get(shape);
    if (first === undefined) {
      firstByShape.set(shape, index);
      return;
    }
    problems.push(
      problem(
        'medium',
        `edge ${edge.id} repeats edge ${graph.edges[first].id}: ${edge.source} -> ${edge.target} (${edge.kind})`,
        [`edge.${first + 1}`, `edge.${index + 1}`],
      ),
    );
  });
  return problems;
};

export const referencesValidator: Validator<CanvasSubmission> = {
  id: REFERENCES_VALIDATOR_ID,
  gate: 'block',
  validate: (artifact, contract) =>
    check(REFERENCES_VALIDATOR_ID, 'block', artifact, contract, references),
};

export const structureValidator: Validator<CanvasSubmission> = {
  id: STRUCTURE_VALIDATOR_ID,
  gate: 'warn',
  validate: (artifact, contract) =>
    check(STRUCTURE_VALIDATOR_ID, 'warn', artifact, contract, structure),
};
