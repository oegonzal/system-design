import type { RunDumpEntryDto } from '@sysdesign/contracts';

/**
 * A run's dump files, joined to the calls a reader already knows about.
 *
 * The paths arrive opaque and sorted, with no grammar attached — deliberately,
 * because the one piece of grammar a path obviously carries is a lie. Measured
 * on disk, a model-call file's leading position number says nothing about what
 * the file is: `05-llm/01.` is the producer in five of three hundred and
 * thirty-seven recorded runs and something else in the rest, so any label taken
 * from it would be wrong most of the time.
 *
 * What a file CAN be joined on is the stem the dump writer composes from fields
 * the run record also carries: the call's scope and its ordinal. So the name is
 * decomposed exactly — never matched by substring, which would let the scope
 * `requirements.s2` claim `critic.requirements.s2`'s files — by reading it from
 * the end: extension, kind, ordinal, and whatever lies between the position and
 * the ordinal is the scope, dots included.
 */

/** The folder the writer puts model calls in. */
export const LLM_FOLDER = '05-llm/';

export const DUMP_FILE_KINDS = ['system', 'user', 'response', 'meta'] as const;
export type DumpFileKind = (typeof DUMP_FILE_KINDS)[number];

export interface LlmFileName {
  /** The position prefix. Read so the rest can be, and never used as a label. */
  position: number;
  scope: string;
  ordinal: number;
  kind: DumpFileKind | 'other';
  extension: string;
}

const isDigits = (value: string): boolean => value.length > 0 && /^\d+$/.test(value);

/** The writer's stem, decomposed from the end. Null for a name that is not one. */
export function parseLlmFileName(basename: string): LlmFileName | null {
  const parts = basename.split('.');
  // position, at least one scope segment, ordinal, kind, extension.
  if (parts.length < 5) return null;
  const [position] = parts;
  const extension = parts[parts.length - 1];
  const kind = parts[parts.length - 2];
  const ordinal = parts[parts.length - 3];
  if (!isDigits(position) || !isDigits(ordinal)) return null;
  const scope = parts.slice(1, parts.length - 3).join('.');
  if (scope === '') return null;
  return {
    position: Number(position),
    scope,
    ordinal: Number(ordinal),
    kind: (DUMP_FILE_KINDS as readonly string[]).includes(kind) ? (kind as DumpFileKind) : 'other',
    extension,
  };
}

export interface DumpFileRef extends RunDumpEntryDto {
  /** What this file holds, from the writer's own stem. */
  kind: DumpFileKind | 'other';
}

/** The order a reader wants a call's files in: what was asked, then what came back. */
const KIND_ORDER: readonly (DumpFileKind | 'other')[] = [
  'system',
  'user',
  'response',
  'meta',
  'other',
];

/** The files of one model call, by the two fields its row records. */
export function filesForCall(
  entries: readonly RunDumpEntryDto[],
  scope: string,
  ordinal: number,
): DumpFileRef[] {
  return entries
    .flatMap((entry) => {
      if (!entry.path.startsWith(LLM_FOLDER)) return [];
      const parsed = parseLlmFileName(entry.path.slice(LLM_FOLDER.length));
      if (parsed === null || parsed.scope !== scope || parsed.ordinal !== ordinal) return [];
      return [{ ...entry, kind: parsed.kind }];
    })
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

export interface DumpFolder {
  /** The leading path segment, which is the writer's own grouping and nothing more. */
  folder: string;
  entries: RunDumpEntryDto[];
  bytes: number;
}

/**
 * The listing grouped by its first segment — the one structural fact a path
 * carries. No name is interpreted beyond that.
 */
export function dumpFolders(entries: readonly RunDumpEntryDto[]): DumpFolder[] {
  const groups = new Map<string, RunDumpEntryDto[]>();
  for (const entry of entries) {
    const slash = entry.path.indexOf('/');
    const folder = slash === -1 ? '' : entry.path.slice(0, slash);
    const held = groups.get(folder) ?? [];
    held.push(entry);
    groups.set(folder, held);
  }
  return [...groups]
    .map(([folder, held]) => ({
      folder,
      entries: held,
      bytes: held.reduce((total, entry) => total + entry.bytes, 0),
    }))
    .sort((a, b) => (a.folder < b.folder ? -1 : a.folder > b.folder ? 1 : 0));
}
