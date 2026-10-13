import { InMemoryWriter, sampleExperience, sampleStory, ScriptedStudio } from '../test/fakes';
import { exportStudio, renderExperience, renderStory, STUDIO_SOURCES } from './export-studio';

describe('the studio record as documents', () => {
  it('[ING-3] renders an experience as one titled section — the company in the heading, the stack and the highlights as the chunker reads them', () => {
    expect(renderExperience(sampleExperience())).toBe(
      [
        '# Senior Engineer — Acme',
        'Built the ledger platform.',
        'Stack: TypeScript, Postgres',
        '- Cut settlement latency by half.\n- Led a team of four.',
      ].join('\n\n'),
    );
    // Nothing is written for a part the record lacks: no "Stack:" with nothing after it.
    expect(renderExperience(sampleExperience({ techStack: [], highlights: [] }))).toBe(
      '# Senior Engineer — Acme\n\nBuilt the ledger platform.',
    );
  });

  it('[ING-3] renders a story with its four parts as its own headings, so a chunk says which part a fact came from', () => {
    expect(renderStory(sampleStory())).toBe(
      [
        '# The settlement backlog',
        '## Situation\n\nSettlements queued for hours at month end.',
        '## Task\n\nBring the backlog under an hour without a rewrite.',
        '## Action\n\nPartitioned the queue by account and added a drain worker.',
        '## Result\n\nMonth-end settlement finished in forty minutes.',
        'Tags: queues, postgres',
      ].join('\n\n'),
    );
    expect(renderStory(sampleStory({ tags: [] }))).not.toContain('Tags');
  });

  it('[ING-3] writes one document per source under the folder, every record a section, and nothing for a source with no records', async () => {
    const writer = new InMemoryWriter();
    const studio = new ScriptedStudio(
      [sampleExperience(), sampleExperience({ title: 'Staff Engineer', companyLabel: 'Globex' })],
      [],
    );

    const report = await exportStudio({ studio, writer }, 'out/studio');

    expect(report).toEqual({
      files: [
        { path: 'out/studio/studio-experiences.md', records: 2 },
        { path: 'out/studio/studio-star-stories.md', records: 0 },
      ],
    });
    expect([...writer.written.keys()]).toEqual(['out/studio/studio-experiences.md']);
    const text = writer.written.get('out/studio/studio-experiences.md') ?? '';
    expect(text.startsWith('# Senior Engineer — Acme\n\n')).toBe(true);
    expect(text).toContain('\n\n# Staff Engineer — Globex\n\n');
    expect(text.endsWith('\n')).toBe(true);
    expect(STUDIO_SOURCES.map((source) => source.file)).toEqual([
      'studio-experiences.md',
      'studio-star-stories.md',
    ]);
  });
});
