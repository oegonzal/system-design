import {
  CANVAS_FINDING_TYPES,
  substituteLocationRefs,
  substituteTokens,
  type EvaluationLocationDto,
} from '@sysdesign/contracts';

/**
 * A lens's sentence as its author reads it. A lens writes the way its prompt
 * taught it to: places by position (`node.3`, `Rationale.2`, `edge.1-2`) and
 * defects by their type token (`data_integrity`). Here every place the grade
 * grounded reads as its label — in full the first time, short once the
 * sentence has said what the part is — and every finding type the canvas
 * pipeline declares reads as the words it is made of. Both by the contract's
 * own grammar (`prose-refs`), the one the API grounds prose with, so the
 * panel, the coach rows and the export cannot disagree about what a sentence
 * cites. Types are worded first: a label put in place is never read again.
 */
export function lensProse(prose: string, locations: readonly EvaluationLocationDto[]): string {
  return substituteLocationRefs(substituteTokens(prose, CANVAS_FINDING_TYPES), locations);
}
