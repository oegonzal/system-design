import {
  validateBriefReferences,
  validateGraphReferences,
  validateModelReferences,
  validateNarration,
  type DesignSubmission,
  type SuccessCriterion,
} from '@sysdesign/contracts';

/**
 * Every structural problem of a submission against the prompt's rubric, in
 * one list. This is the whole of what the studio checks before a design is
 * graded: what is impossible — an edge to nothing, a binding to a criterion
 * the prompt never derived — never what is merely unwise. Whether the design
 * is any good is the quality loop's to say.
 */
export const submissionProblems = (
  submission: DesignSubmission,
  criteria: readonly SuccessCriterion[],
): string[] => [
  ...validateGraphReferences(submission.graph),
  ...(submission.model ? validateModelReferences(submission.graph, submission.model) : []),
  ...(submission.brief
    ? validateBriefReferences(
        submission.graph,
        submission.brief,
        criteria,
        submission.model ?? null,
      )
    : []),
  ...(submission.narrative
    ? validateNarration(submission.graph, submission.narrative, criteria)
    : []),
];
