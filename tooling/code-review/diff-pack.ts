/** The change's diff, split by file and packed into a budget without ever splitting a source from its spec. */

export interface FileDiff {
  file: string;
  body: string;
  added: number;
  removed: number;
}

/**
 * Splits a multi-file patch into per-file segments.
 *
 * Safe because every *body* line in a unified diff carries a one-character
 * prefix, so a file whose own content contains `diff --git` renders as
 * `+diff --git` and cannot match at column 0.
 *
 * A segment that cannot be attributed to a known path is *reported*, never
 * dropped — a silently lost file is a file no critic can object to, while the
 * pipeline reports success either way. Everything in this half of the module
 * is arranged against that failure mode.
 */
export function splitDiffByFile(
  diff: string,
  knownFiles: string[],
): { segments: FileDiff[]; unattributed: string[] } {
  const known = new Set(knownFiles);
  const segments: FileDiff[] = [];
  const unattributed: string[] = [];

  const parts = diff.split(/^(?=diff --git )/m).filter((part) => part.trim());

  for (const body of parts) {
    const to = /^\+\+\+ b\/(.+)$/m.exec(body)?.[1];
    const from = /^--- a\/(.+)$/m.exec(body)?.[1];
    const header = /^diff --git a\/(.+?) b\/(.+)$/m.exec(body)?.[2];
    const file = [to, header, from].find((candidate) => candidate && known.has(candidate));

    if (!file) {
      unattributed.push((body.split('\n')[0] ?? '').slice(0, 120));
      continue;
    }

    const lines = body.split('\n');
    segments.push({
      file,
      body,
      added: lines.filter((line) => line.startsWith('+') && !line.startsWith('+++')).length,
      removed: lines.filter((line) => line.startsWith('-') && !line.startsWith('---')).length,
    });
  }

  return { segments, unattributed };
}

export const SPEC = /\.spec\.[cm]?[jt]sx?$/;
export const STORIES = /\.stories\.[cm]?[jt]sx?$/;
const CONFIG = /(^|\/)[\w.-]*\.config\.[cm]?[jt]s$/;

/**
 * The smallest unit whose omission cannot manufacture an absence claim.
 *
 * A source file and its colocated spec share a key so packing can never split
 * them: pack all source first, run out of budget, and every spec is omitted —
 * which shows the testability critic a monorepo of untested code and invites a
 * false `missing-test` on every file.
 *
 * Stories are deliberately excluded. No critic has a "missing story" category,
 * so omitting one cannot invent a finding, which makes them safely separable.
 */
export function bundleKey(file: string): string {
  if (STORIES.test(file)) return file;
  return file.replace(SPEC, '').replace(/\.[cm]?[jt]sx?$/, '');
}

export type Tier = 1 | 2 | 3 | 4;

/** Assigned per bundle, not per file — an orphan spec is only orphaned as a set. */
function tierOf(files: string[]): Tier {
  if (files.every((file) => CONFIG.test(file))) return 4;
  if (files.every((file) => STORIES.test(file))) return 3;
  if (files.every((file) => SPEC.test(file))) return 2;
  return 1;
}

export type PackStatus = 'included' | 'partial' | 'omitted';

export interface PackedFile {
  file: string;
  status: PackStatus;
  /** Characters actually placed in the prompt. */
  chars: number;
  /** Characters in the complete per-file diff. */
  totalChars: number;
  added: number;
  removed: number;
  /** A `*.spec.*` sibling exists on disk, whether or not it changed. */
  hasColocatedSpec: boolean;
}

export interface PackedDiff {
  diff: string;
  files: PackedFile[];
  included: string[];
  omitted: string[];
  budgetChars: number;
  usedChars: number;
  complete: boolean;
}

/**
 * Keeps whole hunks up to `maxChars`.
 *
 * Returns null when not even the first hunk fits — which is the common case for
 * a newly added file, since that is a single hunk covering the whole file.
 * `capFile` handles that fallback; nothing else should call this directly.
 */
export function truncateAtHunkBoundary(body: string, maxChars: number): string | null {
  const firstHunk = body.indexOf('\n@@');
  if (firstHunk === -1) return null;

  const header = body.slice(0, firstHunk + 1);
  const hunks = body.slice(firstHunk + 1).split(/^(?=@@ )/m);

  let kept = header;
  let any = false;

  for (const hunk of hunks) {
    if (kept.length + hunk.length > maxChars) break;
    kept += hunk;
    any = true;
  }

  return any ? `${kept}\n@@ [remaining hunks not shown] @@\n` : null;
}

/**
 * Brings a file inside the per-file cap without ever losing it entirely.
 *
 * Whole hunks first. Failing that — a new file is one hunk, so the hunk
 * boundary is no help — whole *lines*, which is still a boundary a reader can
 * trust, with an explicit count of what was left out. Omitting the file
 * entirely is the one option not on the table: a capped file is still a file
 * the critic can see, so no absence is implied.
 */
export function capFile(body: string, maxChars: number): string {
  if (body.length <= maxChars) return body;

  const byHunk = truncateAtHunkBoundary(body, maxChars);
  if (byHunk !== null) return byHunk;

  const lines = body.split('\n');
  const kept: string[] = [];
  let used = 0;

  for (const line of lines) {
    if (used + line.length + 1 > maxChars) break;
    kept.push(line);
    used += line.length + 1;
  }

  return `${kept.join('\n')}\n[${lines.length - kept.length} of ${lines.length} lines not shown]\n`;
}

export interface PackOptions {
  budgetChars: number;
  maxFileChars: number;
  /** Whether a colocated spec exists on disk. Injected so packing stays pure. */
  specExists: (file: string) => boolean;
}

/**
 * Fills the budget with whole files, smallest bundle first within each tier.
 *
 * Ascending size rather than path order, because git emits by path: under a
 * path-ordered fill the alphabetically-early packages always survive and the
 * late ones never appear at all, which starves an entire package out of every
 * review without a single message saying so.
 */
export function packDiff(segments: FileDiff[], options: PackOptions): PackedDiff {
  const bundles = new Map<string, FileDiff[]>();
  for (const segment of segments) {
    const key = bundleKey(segment.file);
    bundles.set(key, [...(bundles.get(key) ?? []), segment]);
  }

  const ordered = [...bundles.entries()]
    .map(([key, files]) => ({
      key,
      files,
      tier: tierOf(files.map((f) => f.file)),
      size: files.reduce((total, f) => total + f.body.length, 0),
    }))
    .sort((a, b) => a.tier - b.tier || a.size - b.size || a.key.localeCompare(b.key));

  const packed = new Map<string, PackedFile>();
  const bodies = new Map<string, string>();
  let used = 0;

  for (const bundle of ordered) {
    // All or nothing. Anything else can show a source file whose spec was left
    // out, which reads as "this file has no test" — the false finding this
    // whole arrangement exists to prevent.
    const rendered = bundle.files.map((file) => ({
      file,
      body: capFile(file.body, options.maxFileChars),
    }));

    const cost = rendered.reduce((total, r) => total + r.body.length, 0);
    const fits = cost > 0 && used + cost <= options.budgetChars;

    for (const { file, body } of rendered) {
      const status: PackStatus = !fits
        ? 'omitted'
        : body.length < file.body.length
          ? 'partial'
          : 'included';

      packed.set(file.file, {
        file: file.file,
        status,
        chars: status === 'omitted' ? 0 : body.length,
        totalChars: file.body.length,
        added: file.added,
        removed: file.removed,
        hasColocatedSpec: options.specExists(file.file),
      });
      bodies.set(file.file, status === 'omitted' ? '' : body);
    }

    if (fits) used += cost;
  }

  // Emitted in repo-path order so the prompt reads coherently even though it
  // was packed smallest-first.
  const files = [...packed.values()].sort((a, b) => a.file.localeCompare(b.file));

  return {
    diff: files
      .filter((f) => f.status !== 'omitted')
      .map((f) => bodies.get(f.file) ?? '')
      .join(''),
    files,
    included: files.filter((f) => f.status !== 'omitted').map((f) => f.file),
    omitted: files.filter((f) => f.status === 'omitted').map((f) => f.file),
    budgetChars: options.budgetChars,
    usedChars: used,
    complete: files.every((f) => f.status === 'included'),
  };
}
