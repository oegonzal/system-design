/**
 * The exact checks on a canvas, before any lens reads it. Both run on every
 * artifact the engine hands over, well-formed or not, so each starts from the
 * output schema; neither reads prose.
 *
 * Each reads the artifact the way the model seam reads a reply, so a field
 * past its size never hides a fault from them.
 *
 * `references` blocks. An edge to a node that is not there, a carry naming an
 * operation neither endpoint declares, a brief bound to a criterion the
 * contract never listed, to a node the canvas does not hold or to an entity
 * the model does not declare, a model owned by an undrawn node, a path that
 * does not connect — none of it can be judged, and a coach that produced it
 * is asked to fix that before anything else. The checks are the same four
 * the studio runs on a submission, from `@sysdesign/contracts`, so what the
 * studio refuses and what the loop blocks cannot differ.
 *
 * `structure` warns. A node no edge touches and two edges saying the same
 * thing are legal and judgeable, but every lens is told they are there.
 */
import {
  validateBriefReferences,
  validateGraphReferences,
  validateModelReferences,
  validateNarration,
  type ValidationProblem,
} from '@sysdesign/contracts';

import {
  artifactValidator,
  problem,
  REFERENCES_VALIDATOR_ID,
  type ArtifactRule,
} from '../../core/contracts';
import type { Validator } from '../../core/ports';
import type { CanvasSubmission } from './output';

export { REFERENCES_VALIDATOR_ID };
export const STRUCTURE_VALIDATOR_ID = 'structure';

type Rule = ArtifactRule<CanvasSubmission>;

const references: Rule = ({ graph, brief, narrative, model }, contract) =>
  [
    ...validateGraphReferences(graph),
    ...(model === undefined || model === null ? [] : validateModelReferences(graph, model)),
    ...(brief === null
      ? []
      : validateBriefReferences(graph, brief, contract.criteria, model ?? null)),
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

export const referencesValidator: Validator<CanvasSubmission> = artifactValidator(
  REFERENCES_VALIDATOR_ID,
  'block',
  references,
);

export const structureValidator: Validator<CanvasSubmission> = artifactValidator(
  STRUCTURE_VALIDATOR_ID,
  'warn',
  structure,
);
