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
 *
 * `tracing` warns. What the contract's request lifecycle declares for every
 * traced path and every component — a stage of the way in that nothing on or
 * beside the path serves, a path ending where the request is still in
 * flight, a component no traced path reaches — stated as facts for the
 * critics and as remediations for the coach; whether each is a defect here
 * is the communication critic's judgement, never this file's.
 */
import {
  nodeReach,
  pathStages,
  roleNames,
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
const STRUCTURE_VALIDATOR_ID = 'structure';
const TRACING_VALIDATOR_ID = 'tracing';

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

const tracing: Rule = ({ graph, brief }) => {
  if (brief === null) return [];
  const problems: ValidationProblem[] = [];
  brief.bindings.forEach((binding, index) => {
    if (binding.path === undefined || binding.path.length === 0) return;
    const traced = pathStages(graph, binding.path);
    const at = [`binding.${index + 1}`];
    const { entry, firstNodeId, rest } = traced;
    if (entry === null && firstNodeId !== null) {
      problems.push(
        problem(
          'low',
          `path of ${binding.criterionId} begins at ${firstNodeId}, which is not where a request enters; no way in to check`,
          at,
        ),
      );
    }
    for (const item of traced.stages) {
      if (item.conditional || item.covered !== null) continue;
      const keys =
        item.stage.hopKeys.length === 0
          ? ''
          : ` and no hop declaring ${item.stage.hopKeys.join(' or ')}`;
      problems.push(
        problem(
          'medium',
          `path of ${binding.criterionId} enters as ${entry?.label} at ${firstNodeId} and shows no ${item.stage.label}: no ${roleNames(item.stage.roles)} block on or beside the path${keys}`,
          at,
        ),
      );
    }
    if (rest !== null && !rest.atRest) {
      problems.push(
        problem(
          'medium',
          `path of ${binding.criterionId} ends at ${rest.nodeId} (${roleNames([rest.kind])}), which is not where a request comes to rest`,
          at,
        ),
      );
    }
  });
  nodeReach(graph, brief.bindings).forEach((item, index) => {
    if (item.reach !== 'untraced') return;
    problems.push(
      problem(
        item.bound ? 'low' : 'medium',
        item.bound
          ? `node ${item.nodeId} is on no traced path and beside none`
          : `node ${item.nodeId} is in no binding, on no traced path and beside none`,
        [`node.${index + 1}`],
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

export const tracingValidator: Validator<CanvasSubmission> = artifactValidator(
  TRACING_VALIDATOR_ID,
  'warn',
  tracing,
);
