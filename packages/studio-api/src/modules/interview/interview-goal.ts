import {
  renderIndexSection,
  withinBudget,
  type InterviewIndex,
  type InterviewItemKind,
  type SuccessCriterion,
  type TranscriptTurn,
} from '@sysdesign/contracts';

/** One thing the interviewer must address: a question the candidate asked, or a criterion to probe. */
export interface InterviewItem {
  kind: InterviewItemKind;
  text: string;
}

export interface InterviewGoalSource {
  title: string;
  /** The whole prompt: the interviewer's notes, every section. */
  markdown: string;
  criteria: readonly SuccessCriterion[];
  /** The turns taken so far, in order; the interviewer reads them as the conversation. */
  turns: readonly TranscriptTurn[];
  items: readonly InterviewItem[];
}

/** The id an item is addressed by: positional within its kind, as the index lists it. */
export const itemId = (kind: InterviewItemKind, position: number): string =>
  `${kind}.${position + 1}`;

/**
 * A turn's goal as the `interview-turn` pipeline reads it: the notes, the
 * rubric with ids, the transcript, and the items each led by the id a reply
 * must answer to — closed by the index the validators read, so an item or a
 * criterion is a declared fact of the goal, never a reading of its prose.
 * Refused when it would not fit the engine's goal budget.
 */
export function renderInterviewGoal(source: InterviewGoalSource): string {
  const byKind = new Map<InterviewItemKind, number>();
  const items = source.items.map((item) => {
    const position = byKind.get(item.kind) ?? 0;
    byKind.set(item.kind, position + 1);
    return { id: itemId(item.kind, position), kind: item.kind, text: item.text };
  });
  const index: InterviewIndex = {
    items: items.map(({ id, kind }) => ({ id, kind })),
    criterionIds: source.criteria.map((criterion) => criterion.id),
  };
  const lines = [
    `# Interview: ${source.title}`,
    '',
    '## Interviewer notes',
    '',
    source.markdown.trim(),
    '',
    '## Rubric',
    '',
    ...source.criteria.map(
      (criterion) => `- ${criterion.id} (${criterion.kind}): ${criterion.statement}`,
    ),
    '',
    '## Transcript so far',
    '',
    ...(source.turns.length === 0
      ? ['(none yet)']
      : source.turns.map(
          (turn, position) => `[turn.${position + 1}] ${turn.role} (${turn.phase}): ${turn.text}`,
        )),
    '',
    '## Items to address',
    '',
    ...items.map((item) => `[${item.id}] ${item.text}`),
    '',
    renderIndexSection(index),
  ];
  return withinBudget(lines.join('\n'));
}
