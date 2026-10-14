import type { ExperienceProfileDto } from '@sysdesign/contracts';

export type ExperienceGoalSource = Pick<
  ExperienceProfileDto,
  'title' | 'companyLabel' | 'summary' | 'techStack' | 'highlights' | 'practiceHighlights'
>;

/**
 * An experience as the `design-prompt` pipeline reads it: the goal its
 * writer drafts from and its critics check the draft against. The company
 * label is deliberately in the text — the fidelity critic exists to catch it
 * leaking into the prompt, and cannot catch what it was never shown. The
 * practice lines are bullets after the highlights, under the same heading:
 * the writer sizes a prompt from them as from any highlight, and the goal
 * reads exactly as it did when they were written as the experience's last
 * highlights. Whose the experience is never reaches the goal — a prompt is
 * drawn from a practice example as from the subject's own.
 */
export function renderExperienceGoal(experience: ExperienceGoalSource): string {
  return [
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
  ].join('\n');
}
