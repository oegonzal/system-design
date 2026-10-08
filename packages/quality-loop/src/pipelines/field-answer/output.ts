/**
 * Field answers as the lenses read them: the summary, then every field by its
 * position. Ids are positional and engine-assigned (`field.3`), never the
 * page's refs, and the render prints the ref beside each so a finding
 * located at `field.3` is a finding about one field of one form. The schema
 * is the contract's — the session routes the accepted answers with the same
 * one, and the form-memory orchestrator reports their admission.
 */
import {
  fieldAnswersSchema,
  type FieldAnswer,
  type FieldAnswers,
  quotedJson,
} from '@sysdesign/contracts';

import { numbered, numberedSection, type OutputShape } from '../../core/contracts';

/** `e1 — answer "6" — confidence high — basis m1 — reason`: the ref, the decision, what rests on what. */
const fieldLine = (answer: FieldAnswer): string =>
  [
    `${answer.ref} — ${answer.decision}${answer.value === null ? '' : ` ${quotedJson(answer.value)}`}`,
    `confidence ${answer.confidence}`,
    `basis ${answer.basis.length > 0 ? answer.basis.join(', ') : 'none'}`,
    answer.reason,
  ].join(' — ');

export const fieldAnswersOutput: OutputShape<FieldAnswers> = {
  schema: fieldAnswersSchema,

  locate: (answers) => [
    { id: 'summary', label: 'Summary' },
    ...numbered('field', answers.fields, (answer) => `${answer.ref} ${answer.decision}`),
  ],

  render: (answers) =>
    [
      `[summary] ${answers.summary}`,
      ...numberedSection('Fields', 'field', answers.fields, fieldLine),
    ].join('\n'),
};
