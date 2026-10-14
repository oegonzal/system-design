import { join } from 'node:path';

import {
  EXPERIENCE_ORIGINS,
  type ExperienceOrigin,
  type ExperienceProfileDto,
  type StarStoryDto,
} from '@sysdesign/contracts';

import type { DocumentWriter, StudioSource } from './ports';

/**
 * The studio's record of the subject — the experience profiles that are their
 * own and the STAR stories kept against them — written as markdown documents
 * the ingester then reads like any notes file. The boundaries forbid this
 * package the studio's database, and the studio's API already serves both
 * lists, so the record crosses as documents: one file per source, one titled
 * section per record, through a declared field map (`STUDIO_SOURCES`) rather
 * than code that knows one corpus. A story's four parts are its own headings,
 * so the chunker's context names which part a fact came from and a
 * `profile_story` can cite the part whole.
 *
 * The studio also keeps examples written to practise on, and an own
 * experience may carry lines only so a prompt drawn from it has them. Neither
 * is the subject's, so neither is written: every record is decided by one
 * rule over its origin — an experience by its own, a story by that of the
 * experience it was drawn from — the rest are counted as withheld under that
 * origin, and an experience's practice lines are never rendered. A record
 * whose origin is not known is refused by name before anything is written —
 * never guessed, and never skipped.
 */

/** A story beside the origin of the experience it was drawn from — null when it was drawn from none. */
interface DrawnStory {
  story: StarStoryDto;
  from: ExperienceOrigin | null;
}

/** Both of the studio's lists, read whole once per export, each story beside its experience's origin. */
interface StudioLists {
  experiences: readonly ExperienceProfileDto[];
  stories: readonly DrawnStory[];
}

/** How many records a source withheld, under the origin that withheld each. */
type WithheldByOrigin = Partial<Record<ExperienceOrigin, number>>;

export interface StudioExport {
  /** The file written under the output folder. */
  file: string;
  /** The source's records in the lists: those it keeps, rendered as its document, and those it withheld, by origin. */
  read(lists: StudioLists): { records: number; withheld: WithheldByOrigin; text: string };
}

/**
 * Whether an experience of each origin is the subject's own record — the one
 * kind the export states as theirs. Total over the vocabulary, so an origin
 * the contract adds is decided here before the export compiles; the report
 * names what it withholds by the origin itself.
 */
const OWN_RECORD: Record<ExperienceOrigin, boolean> = { own: true, practice: false };

/**
 * Records whose origin is not known — an experience whose origin the contract
 * does not declare (a studio older than origins, or newer than this build), or
 * a story drawn from an experience the studio did not serve — each named with
 * why. Whose they are is not known, so the export writes nothing rather than
 * guess.
 */
export class UndeclaredOrigin extends Error {
  override readonly name = 'UndeclaredOrigin';
  constructor(records: readonly string[]) {
    super(
      `the studio served ${records.length} record(s) whose origin is not one of ${EXPERIENCE_ORIGINS.join(', ')}, so nothing was written: ${records.join(', ')}`,
    );
  }
}

/** How a refusal names the origin an experience was served with. */
const servedOrigin = (origin: unknown): string =>
  origin === undefined ? 'no origin' : JSON.stringify(origin);

/**
 * The lists with every record's origin known, each story beside the origin of
 * the experience it was drawn from; every record whose origin is not known is
 * refused at once, by name.
 */
function withOrigins(
  experiences: readonly ExperienceProfileDto[],
  stories: readonly StarStoryDto[],
): StudioLists {
  const unknown = experiences
    .filter((experience) => !EXPERIENCE_ORIGINS.includes(experience.origin))
    .map((experience) => `experience ${experience.id} (${servedOrigin(experience.origin)})`);
  const origins = new Map(experiences.map((experience) => [experience.id, experience.origin]));
  const drawn: DrawnStory[] = [];
  for (const story of stories) {
    const from = story.experienceId === null ? null : origins.get(story.experienceId);
    if (from === undefined) {
      unknown.push(
        `story ${story.id} (drawn from experience ${story.experienceId}, which the studio did not serve)`,
      );
    } else {
      drawn.push({ story, from });
    }
  }
  if (unknown.length > 0) throw new UndeclaredOrigin(unknown);
  return { experiences, stories: drawn };
}

const list = (label: string, items: readonly string[]): string[] =>
  items.length === 0 ? [] : [`${label}: ${items.join(', ')}`];

/** `# <title> — <company>`, the summary, the stack and the highlights as bullets — never the practice highlights. */
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

/**
 * A source over the one rule every record is decided by: kept when the origin
 * it is decided by is the subject's own, or when it has none — a story drawn
 * from no experience, which the studio holds as the subject's — and withheld
 * under that origin otherwise.
 */
const sourceOf = <T>(
  file: string,
  records: (lists: StudioLists) => readonly T[],
  originOf: (record: T) => ExperienceOrigin | null,
  render: (record: T) => string,
): StudioExport => ({
  file,
  read(lists) {
    const kept: T[] = [];
    const withheld: WithheldByOrigin = {};
    for (const record of records(lists)) {
      const origin = originOf(record);
      if (origin === null || OWN_RECORD[origin]) kept.push(record);
      else withheld[origin] = (withheld[origin] ?? 0) + 1;
    }
    return { records: kept.length, withheld, text: kept.map(render).join('\n\n') };
  },
});

/**
 * Every source exported, in the order written: its records, the origin each
 * is decided by — an experience by its own, a story by its experience's — and
 * how one is rendered. Another source is another entry, never different code.
 */
export const STUDIO_SOURCES: readonly StudioExport[] = [
  sourceOf(
    'studio-experiences.md',
    (lists) => lists.experiences,
    (experience) => experience.origin,
    renderExperience,
  ),
  sourceOf(
    'studio-star-stories.md',
    (lists) => lists.stories,
    (drawn) => drawn.from,
    (drawn) => renderStory(drawn.story),
  ),
];

export interface ExportedFile {
  /** Where the document is — under the output folder as given. */
  path: string;
  /** The subject's own records, written; none writes no file, since an empty document is nothing to ingest. */
  records: number;
  /** The records the source holds that are not the subject's, never written — counted under the origin that withheld each. */
  withheld: WithheldByOrigin;
  /** Whether a document an earlier export left at the path was removed, because this one wrote none there. */
  removed: boolean;
}

export interface ExportReport {
  files: ExportedFile[];
}

export interface ExportDeps {
  studio: StudioSource;
  writer: DocumentWriter;
}

/**
 * Both lists read whole and every record's origin known before anything is
 * written; then every source written as its document under `outDir` with the
 * records it keeps. A source that keeps none writes nothing and removes the
 * document an earlier export left at its path, so the folder never offers the
 * ingester a record the studio no longer states as the subject's.
 */
export async function exportStudio(deps: ExportDeps, outDir: string): Promise<ExportReport> {
  const experiences = await deps.studio.experiences();
  const stories = await deps.studio.stories();
  const lists = withOrigins(experiences, stories);

  const files: ExportedFile[] = [];
  for (const source of STUDIO_SOURCES) {
    const { records, withheld, text } = source.read(lists);
    const path = join(outDir, source.file);
    if (records > 0) {
      await deps.writer.write(path, `${text}\n`);
      files.push({ path, records, withheld, removed: false });
    } else {
      files.push({ path, records, withheld, removed: await deps.writer.remove(path) });
    }
  }
  return { files };
}
