import type { ExperienceProfileDto } from '@sysdesign/contracts';

import { InMemoryWriter, sampleExperience, sampleStory, ScriptedStudio } from '../test/fakes';
import {
  exportStudio,
  renderExperience,
  renderStory,
  STUDIO_SOURCES,
  UndeclaredOrigin,
} from './export-studio';
import type { StudioSource } from './ports';

const OWN_ID = '11111111-1111-4111-8111-111111111111';
const PRACTICE_ID = '33333333-3333-4333-8333-333333333333';

/** An example written for practice, every part of it its own words, so a leak of any part is seen. */
const practiceExample = (): ExperienceProfileDto =>
  sampleExperience({
    id: PRACTICE_ID,
    slug: 'practice-example',
    origin: 'practice',
    companyLabel: 'Globex',
    title: 'Practice Architect',
    summary: 'Designed a storefront order history for practice.',
    techStack: ['Redis'],
    highlights: ['Merged two order feeds into one read model.'],
    practiceHighlights: ['Holds 2,000 shoppers at a holiday peak.'],
  });

/** An experience as a studio serves it with an origin this build does not declare, or none. */
const servedWithOrigin = (id: string, origin: unknown): ExperienceProfileDto =>
  ({ ...sampleExperience({ id }), origin }) as unknown as ExperienceProfileDto;

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

  it('[ING-3] never renders an experience’s practice lines, and renders every highlight it attests', () => {
    const practised = sampleExperience({
      practiceHighlights: ['Serves ~9,000 requests/s at peak.'],
    });
    expect(renderExperience(practised)).toBe(renderExperience(sampleExperience()));
    expect(renderExperience(practised)).not.toContain('9,000');
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
        { path: 'out/studio/studio-experiences.md', records: 2, withheld: {}, removed: false },
        { path: 'out/studio/studio-star-stories.md', records: 0, withheld: {}, removed: false },
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

  it('[ING-3] withholds an experience written for practice — no part of it is written — and counts it under its origin', async () => {
    const writer = new InMemoryWriter();
    const studio = new ScriptedStudio([sampleExperience(), practiceExample()], []);

    const report = await exportStudio({ studio, writer }, 'out');

    expect(report.files[0]).toEqual({
      path: 'out/studio-experiences.md',
      records: 1,
      withheld: { practice: 1 },
      removed: false,
    });
    const text = writer.written.get('out/studio-experiences.md') ?? '';
    expect(text).toBe(`${renderExperience(sampleExperience())}\n`);
    const example = practiceExample();
    for (const part of [
      example.title,
      example.companyLabel,
      example.summary,
      ...example.techStack,
      ...example.highlights,
      ...example.practiceHighlights,
    ]) {
      expect(text).not.toContain(part);
    }
  });

  it('[ING-3] keeps a story drawn from no experience or from the subject’s own, and withholds one drawn from a practice example under that example’s origin', async () => {
    const writer = new InMemoryWriter();
    const studio = new ScriptedStudio(
      [sampleExperience({ id: OWN_ID }), practiceExample()],
      [
        sampleStory({ title: 'Unlinked story' }),
        sampleStory({ title: 'Own story', experienceId: OWN_ID }),
        sampleStory({ title: 'Practice story', experienceId: PRACTICE_ID }),
      ],
    );

    const report = await exportStudio({ studio, writer }, 'out');

    expect(report.files[1]).toEqual({
      path: 'out/studio-star-stories.md',
      records: 2,
      withheld: { practice: 1 },
      removed: false,
    });
    const text = writer.written.get('out/studio-star-stories.md') ?? '';
    expect(text).toContain('# Unlinked story');
    expect(text).toContain('# Own story');
    expect(text).not.toContain('Practice story');
  });

  it('[ING-3] removes the document an earlier export left when a source keeps none of the subject’s records, so it is never ingested again', async () => {
    const writer = new InMemoryWriter();
    writer.written.set('out/studio-experiences.md', '# An earlier export\n');
    const studio = new ScriptedStudio(
      [practiceExample()],
      [sampleStory({ experienceId: PRACTICE_ID })],
    );

    const report = await exportStudio({ studio, writer }, 'out');

    expect(report).toEqual({
      files: [
        { path: 'out/studio-experiences.md', records: 0, withheld: { practice: 1 }, removed: true },
        {
          path: 'out/studio-star-stories.md',
          records: 0,
          withheld: { practice: 1 },
          removed: false,
        },
      ],
    });
    expect(writer.written.size).toBe(0);
    expect(writer.removed).toEqual(['out/studio-experiences.md', 'out/studio-star-stories.md']);
  });

  it('[ING-3] refuses by name an experience whose origin the contract does not declare, or that declares none, leaving an earlier export as it was', async () => {
    const writer = new InMemoryWriter();
    writer.written.set('out/studio-experiences.md', '# An earlier export\n');
    const studio = new ScriptedStudio([
      sampleExperience(),
      servedWithOrigin('44444444-4444-4444-8444-444444444444', undefined),
      servedWithOrigin('55555555-5555-4555-8555-555555555555', 'career'),
    ]);

    const refused = exportStudio({ studio, writer }, 'out');

    await expect(refused).rejects.toBeInstanceOf(UndeclaredOrigin);
    await expect(refused).rejects.toThrow(
      'experience 44444444-4444-4444-8444-444444444444 (no origin), experience 55555555-5555-4555-8555-555555555555 ("career")',
    );
    expect(writer.written).toEqual(
      new Map([['out/studio-experiences.md', '# An earlier export\n']]),
    );
    expect(writer.removed).toEqual([]);
  });

  it('[ING-3] refuses by name a story drawn from an experience the studio did not serve — whose it is cannot be told — leaving an earlier export as it was', async () => {
    const writer = new InMemoryWriter();
    writer.written.set('out/studio-star-stories.md', '# An earlier export\n');
    const studio = new ScriptedStudio(
      [sampleExperience({ id: OWN_ID })],
      [
        sampleStory({ title: 'Own story', experienceId: OWN_ID }),
        sampleStory({
          id: '66666666-6666-4666-8666-666666666666',
          experienceId: '77777777-7777-4777-8777-777777777777',
        }),
      ],
    );

    const refused = exportStudio({ studio, writer }, 'out');

    await expect(refused).rejects.toBeInstanceOf(UndeclaredOrigin);
    await expect(refused).rejects.toThrow(
      'story 66666666-6666-4666-8666-666666666666 (drawn from experience 77777777-7777-4777-8777-777777777777, which the studio did not serve)',
    );
    expect(writer.written).toEqual(
      new Map([['out/studio-star-stories.md', '# An earlier export\n']]),
    );
    expect(writer.removed).toEqual([]);
  });

  it('[ING-3] reads both lists before writing anything: a studio that refuses its stories leaves an earlier export as it was', async () => {
    const writer = new InMemoryWriter();
    writer.written.set('out/studio-experiences.md', '# An earlier export\n');
    const studio: StudioSource = {
      experiences: () => Promise.resolve([sampleExperience()]),
      stories: () => Promise.reject(new Error('GET /star-stories: the studio answered 503')),
    };

    await expect(exportStudio({ studio, writer }, 'out')).rejects.toThrow(
      'GET /star-stories: the studio answered 503',
    );
    expect(writer.written).toEqual(
      new Map([['out/studio-experiences.md', '# An earlier export\n']]),
    );
    expect(writer.removed).toEqual([]);
  });
});
