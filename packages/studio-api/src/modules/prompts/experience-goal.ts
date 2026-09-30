import type { ExperienceProfileDto } from '@sysdesign/contracts';

export type ExperienceGoalSource = Pick<
  ExperienceProfileDto,
  'title' | 'companyLabel' | 'summary' | 'techStack' | 'highlights'
>;

/**
 * An experience as the `design-prompt` pipeline reads it: the goal its
 * writer drafts from and its critics check the draft against. The company
 * label is deliberately in the text — the fidelity critic exists to catch it
 * leaking into the prompt, and cannot catch what it was never shown.
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
    ...experience.highlights.map((highlight) => `- ${highlight}`),
    '',
  ].join('\n');
}
