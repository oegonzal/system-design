import { describe, expect, it } from 'vitest';

import { renderExperienceGoal, type ExperienceGoalSource } from './experience-goal';

const experience: ExperienceGoalSource = {
  title: 'Rebuilt the settlement ledger',
  companyLabel: 'Acme',
  summary: 'Lead engineer on a ledger that settles card payments overnight.',
  techStack: ['TypeScript', 'PostgreSQL', 'Kafka'],
  highlights: ['Cut settlement latency by half', 'Led a team of four'],
  practiceHighlights: ['Month-end peaks reach ~3,000 transfers/s'],
};

describe('the goal a prompt is drawn from', () => {
  it('[GEN-1] renders the experience whole, its practice lines as the last bullets under its highlights — byte for byte the goal the renderer wrote when they were its last highlights', () => {
    // What the goal was before practice lines were marked: the same experience
    // with its practice line written as its last highlight.
    expect(renderExperienceGoal(experience)).toBe(
      [
        '# Rebuilt the settlement ledger',
        '',
        'Where: Acme',
        '',
        '## Summary',
        '',
        'Lead engineer on a ledger that settles card payments overnight.',
        '',
        '## Stack',
        '',
        'TypeScript, PostgreSQL, Kafka',
        '',
        '## Highlights',
        '',
        '- Cut settlement latency by half',
        '- Led a team of four',
        '- Month-end peaks reach ~3,000 transfers/s',
        '',
      ].join('\n'),
    );
  });

  it('[GEN-1] reads the same whichever list a line is kept in, so marking a last highlight as practice never changes a prompt', () => {
    const lines = [...experience.highlights, ...experience.practiceHighlights];
    const goal = renderExperienceGoal({ ...experience, highlights: lines, practiceHighlights: [] });
    expect(renderExperienceGoal(experience)).toBe(goal);
    expect(renderExperienceGoal({ ...experience, highlights: [], practiceHighlights: lines })).toBe(
      goal,
    );
  });
});
