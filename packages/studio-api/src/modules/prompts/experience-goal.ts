import {
  CANVAS_CRITERION_KIND_LABELS,
  PRACTICE_FORMATS,
  type CanvasCriterionKind,
  type ExperienceProfileDto,
  type PracticeFormatId,
} from '@sysdesign/contracts';

export type ExperienceGoalSource = Pick<
  ExperienceProfileDto,
  'title' | 'companyLabel' | 'summary' | 'techStack' | 'highlights' | 'practiceHighlights'
>;

/** What the prompt is for: the format's own guidance and the competencies the author wants drawn out. */
export interface PracticeAsk {
  format: PracticeFormatId;
  emphasis: readonly CanvasCriterionKind[];
}

/**
 * An experience as the `design-prompt` pipeline reads it: the goal its
 * writer drafts from and its critics check the draft against. The company
 * label is deliberately in the text — the fidelity critic exists to catch it
 * leaking into the prompt, and cannot catch what it was never shown. The
 * practice lines are bullets after the highlights, under the same heading:
 * the writer sizes a prompt from them as from any highlight, and the goal
 * reads exactly as it did when they were written as the experience's last
 * highlights. Whose the experience is never reaches the goal — a prompt is
 * drawn from a practice example as from the subject's own. The practice ask
 * — the format's guidance and the emphasised competencies — closes the goal
 * as sections of its own, read by the writer and the deriver as data; the
 * studio always passes one, the whole system when none was chosen.
 */
export function renderExperienceGoal(
  experience: ExperienceGoalSource,
  practice: PracticeAsk | null = null,
): string {
  const lines = [
    `# ${experience.title}`,
    '',
    `Where: ${experience.companyLabel}`,
    '',
    '## Summary',
    '',
    experience.summary,
    '',
    '## Stack',
    '',
    experience.techStack.join(', '),
    '',
    '## Highlights',
    '',
    ...[...experience.highlights, ...experience.practiceHighlights].map((line) => `- ${line}`),
    '',
  ];
  if (practice !== null) {
    const format = PRACTICE_FORMATS[practice.format];
    lines.push('## Practice format', '', `${format.label}: ${format.guidance}`, '');
    const emphasis = practice.emphasis.length > 0 ? practice.emphasis : format.emphasis;
    lines.push(
      '## Emphasis',
      '',
      ...emphasis.map((kind) => `- ${CANVAS_CRITERION_KIND_LABELS[kind]}`),
      '',
    );
  }
  return lines.join('\n');
}
