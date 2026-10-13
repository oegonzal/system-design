import { join } from 'node:path';

import type { ExperienceProfileDto, StarStoryDto } from '@sysdesign/contracts';

import type { DocumentWriter, StudioSource } from './ports';

/**
 * The studio's record of the subject — the experience profiles its prompts
 * are drawn from and the STAR stories kept against them — written as
 * markdown documents the ingester then reads like any notes file. The
 * boundaries forbid this package the studio's database, and the studio's API
 * already serves both lists, so the record crosses as documents: one file
 * per source, one titled section per record, through a declared field map
 * (`STUDIO_SOURCES`) rather than code that knows one corpus. A story's four
 * parts are its own headings, so the chunker's context names which part a
 * fact came from and a `profile_story` can cite the part whole.
 */
export interface StudioExport {
  /** The file written under the output folder. */
  file: string;
  /** The source read whole and rendered: how many records, and the document. */
  read(studio: StudioSource): Promise<{ records: number; text: string }>;
}

const list = (label: string, items: readonly string[]): string[] =>
  items.length === 0 ? [] : [`${label}: ${items.join(', ')}`];

/** `# <title> — <company>`, the summary, the stack and the highlights as bullets. */
export const renderExperience = (experience: ExperienceProfileDto): string =>
  [
    `# ${experience.title} — ${experience.companyLabel}`,
    experience.summary,
    ...list('Stack', experience.techStack),
    ...(experience.highlights.length === 0
      ? []
      : [experience.highlights.map((highlight) => `- ${highlight}`).join('\n')]),
  ].join('\n\n');

/** `# <title>` with Situation, Task, Action and Result as its own sections, and the tags. */
export const renderStory = (story: StarStoryDto): string =>
  [
    `# ${story.title}`,
    `## Situation\n\n${story.situation}`,
    `## Task\n\n${story.task}`,
    `## Action\n\n${story.action}`,
    `## Result\n\n${story.result}`,
    ...list('Tags', story.tags),
  ].join('\n\n');

const sourceOf = <T>(
  file: string,
  fetch: (studio: StudioSource) => Promise<readonly T[]>,
  render: (record: T) => string,
): StudioExport => ({
  file,
  async read(studio) {
    const records = await fetch(studio);
    return { records: records.length, text: records.map(render).join('\n\n') };
  },
});

/** Every source exported, in the order written. Another source is another entry, never different code. */
export const STUDIO_SOURCES: readonly StudioExport[] = [
  sourceOf('studio-experiences.md', (studio) => studio.experiences(), renderExperience),
  sourceOf('studio-star-stories.md', (studio) => studio.stories(), renderStory),
];

export interface ExportedFile {
  /** Where it was written — under the output folder as given. */
  path: string;
  /** Records the source held; none writes no file, since an empty document is nothing to ingest. */
  records: number;
}

export interface ExportReport {
  files: ExportedFile[];
}

export interface ExportDeps {
  studio: StudioSource;
  writer: DocumentWriter;
}

/** Every source read whole and written as its document under `outDir`; a source with no records writes nothing. */
export async function exportStudio(deps: ExportDeps, outDir: string): Promise<ExportReport> {
  const files: ExportedFile[] = [];
  for (const source of STUDIO_SOURCES) {
    const { records, text } = await source.read(deps.studio);
    const path = join(outDir, source.file);
    if (records > 0) await deps.writer.write(path, `${text}\n`);
    files.push({ path, records });
  }
  return { files };
}
