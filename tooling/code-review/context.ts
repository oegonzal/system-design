import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '../..');

export type Scope = { kind: 'staged' } | { kind: 'base'; ref: string };

/**
 * `-c core.quotePath=false` on every invocation.
 *
 * With quoting on, `café.ts` arrives as the literal `"caf\303\251.ts"` — which
 * matches no extension filter and cannot be attributed to a diff segment, so
 * the file drops out of the review in silence. That is the same class of bug
 * the `-z` flags below guard against, one layer down. The pre-commit hook makes
 * the identical choice for the identical reason.
 */
const git = (args: string[]): string =>
  execFileSync('git', ['-c', 'core.quotePath=false', ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });

/**
 * Paths worth an LLM's attention.
 *
 * Lockfiles, generated output and binary assets produce enormous diffs with no
 * reviewable design content, so they are filtered before anything is priced.
 * The rules engine sees a wider set — `IGNORED` still applies, but the
 * extension filter does not, because the branding tripwire must scan markdown
 * and config too.
 */
const REVIEWABLE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const IGNORED = [
  /(^|\/)node_modules\//,
  /(^|\/)dist\//,
  /(^|\/)\.next\//,
  /(^|\/)storybook-static\//,
  /(^|\/)\.nx\//,
  /pnpm-lock\.yaml$/,
];

const notIgnored = (file: string): boolean => !IGNORED.some((pattern) => pattern.test(file));

/**
 * NUL-delimited, because `--name-only` alone makes git *quote* any path holding
 * non-ASCII bytes. `-z` disables the quoting entirely.
 */
function changedFiles(scope: Scope, base?: string): string[] {
  const raw =
    scope.kind === 'staged'
      ? git(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])
      : git(['diff', '--name-only', '-z', '--diff-filter=ACMR', `${base}...HEAD`]);

  return raw.split('\0').filter(Boolean).filter(notIgnored);
}

/**
 * The merge base, so a review covers what this branch adds rather than
 * everything that has landed on the base branch since it forked.
 */
function mergeBase(ref: string): string {
  return git(['merge-base', ref, 'HEAD']).trim();
}

/**
 * The content of a changed file *as the review scope sees it*.
 *
 * The distinction matters for the rules engine: a staged review must judge the
 * staged content, not whatever else is sitting in the worktree — the pre-commit
 * hook deliberately leaves partially-staged files unformatted for the same
 * reason. `undefined` means the blob could not be read (renamed-and-gone,
 * or a repository state this tool has no business guessing about), and every
 * rule treats that as "nothing to scan" rather than as an empty file.
 */
export function readChangedFile(scope: Scope, file: string): string | undefined {
  try {
    return scope.kind === 'staged' ? git(['show', `:${file}`]) : git(['show', `HEAD:${file}`]);
  } catch {
    try {
      return readFileSync(join(REPO_ROOT, file), 'utf8');
    } catch {
      return undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// The change's stated purpose
// ---------------------------------------------------------------------------

export interface Intent {
  /** Empty when unavailable. */
  text: string;
  source: 'env' | 'commits' | 'none';
  commitCount: number;
  truncated: boolean;
}

export const MAX_INTENT_CHARS = 4_000;

/** Trailers and tool signatures say nothing about what the change was for. */
const NOISE = /^(Co-[Aa]uthored-[Bb]y|Signed-off-by|Change-Id|Reviewed-by):|^🤖 Generated with/;

/**
 * A branch of `wip:` commits is worse than no purpose at all: it anchors the
 * critic to a baseline that means nothing, where an absent purpose correctly
 * disables the judgements that need one.
 */
const isSubstantive = (text: string): boolean =>
  text.replace(/\bwip\b/gi, '').replace(/[^a-z]/gi, '').length >= 24;

/** The git call. Kept separate so `deriveIntent` is testable without a repo. */
export function readCommitMessages(base: string): string[] {
  // --reverse: the first commit states the goal, the last states a fix.
  // %x00: commit bodies contain blank lines, so no textual separator is safe.
  const raw = git(['log', '--reverse', '--no-merges', '--format=%B%x00', `${base}..HEAD`]);
  return raw
    .split('\0')
    .map((message) => message.trim())
    .filter(Boolean);
}

/**
 * Assembles the purpose within a character budget.
 *
 * Two passes, and the order matters: every subject line first, then bodies
 * oldest-first while budget remains. Truncating a flat concatenation would shed
 * the *later* subjects, which is the half that says where the branch ended up.
 */
export function deriveIntent(
  commits: string[],
  override?: string,
  maxChars = MAX_INTENT_CHARS,
): Intent {
  // A pull request description is the author's stated intent; commit messages
  // are archaeology. So the override wins.
  const supplied = override?.trim();
  if (supplied && isSubstantive(supplied)) {
    return {
      text: supplied.slice(0, maxChars),
      source: 'env',
      commitCount: 0,
      truncated: supplied.length > maxChars,
    };
  }

  const cleaned = commits
    .map((message) =>
      message
        .split('\n')
        .filter((line) => !NOISE.test(line.trim()))
        .join('\n')
        .trim(),
    )
    .filter(Boolean);

  if (cleaned.length === 0) return { text: '', source: 'none', commitCount: 0, truncated: false };

  const subjects = cleaned.map((message) => message.split('\n')[0] ?? '');
  const outline = subjects.map((subject) => `- ${subject}`).join('\n');

  let text = outline;
  let truncated = false;

  for (const message of cleaned) {
    const body = message.split('\n').slice(1).join('\n').trim();
    if (!body) continue;

    const next = `${text}\n\n## ${message.split('\n')[0]}\n\n${body}`;
    if (next.length > maxChars) {
      truncated = true;
      break;
    }
    text = next;
  }

  if (!isSubstantive(text)) return { text: '', source: 'none', commitCount: 0, truncated: false };

  return {
    text: text.slice(0, maxChars),
    source: 'commits',
    commitCount: cleaned.length,
    truncated,
  };
}

// ---------------------------------------------------------------------------
// The reviewable slice of the review policy
// ---------------------------------------------------------------------------

/**
 * Extracts `## Code Review Expectations` from `review-policy.md` — the file in
 * this directory that states what a reviewer here is entitled to expect — and
 * nothing else.
 *
 * A dedicated file rather than the repository's working notes, because working
 * notes carry product framing, tool lists and local paths that read as policy
 * the moment they appear under a system-prompt heading. The pipeline reads only
 * what was written to be read by it.
 *
 * Fence-aware, because a `##` inside a fenced example must not end the section,
 * and it stops at the next `##` but deliberately not at a `###`.
 */
export function codeReviewExpectations(markdown: string): { text: string; warnings: string[] } {
  const lines = markdown.split('\n');
  const warnings: string[] = [];
  const sections: string[] = [];

  let fence: string | null = null;
  let collecting = false;
  let current: string[] = [];

  for (const line of lines) {
    const fenceMatch = /^\s*(```|~~~)/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1] as string;
      fence = fence === null ? marker : fence === marker ? null : fence;
    }

    if (fence === null && /^##\s/.test(line)) {
      if (collecting) {
        sections.push(current.join('\n').trim());
        current = [];
      }
      collecting = /^##\s+Code Review Expectations\s*$/.test(line);
      continue;
    }

    if (collecting) current.push(line);
  }

  if (collecting) sections.push(current.join('\n').trim());

  if (sections.length === 0) {
    // Refuse to run rather than hand a critic an invented rule set — the same
    // stance repo-map.ts takes when the eslint constraints cannot be derived.
    throw new Error(
      'review-policy.md has no "## Code Review Expectations" section; the review pipeline reads its policy from there',
    );
  }

  if (sections.length > 1) {
    // Silently picking a winner between two versions of the policy is not this
    // tool's call. Concatenating loses no rule and the warning gets it fixed.
    warnings.push(
      `review-policy.md declares "## Code Review Expectations" ${sections.length} times; all copies were sent`,
    );
  }

  return { text: sections.join('\n\n'), warnings };
}

// ---------------------------------------------------------------------------
// Splitting and packing the diff
// ---------------------------------------------------------------------------

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

const SPEC = /\.spec\.[cm]?[jt]sx?$/;
const STORIES = /\.stories\.[cm]?[jt]sx?$/;
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

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export interface ReviewContext {
  /** Reviewable (code) files — what the critics can be shown. */
  files: string[];
  /** Every changed file the rules engine should see, code or not. */
  allFiles: string[];
  packed: PackedDiff;
  /** True when the critics were not shown the whole change. */
  truncated: boolean;
  /** project.json of every project the change touches. */
  projectMetadata: string;
  /** The `## Code Review Expectations` section only. */
  conventions: string;
  intent: Intent;
  /** Non-fatal problems worth surfacing — a duplicated heading, a lost segment. */
  warnings: string[];
  /** Resolved merge base, recorded so a run can be reproduced exactly. */
  base?: string;
}

function projectMetadataFor(files: string[]): string {
  const roots = new Set(
    files
      .map((file) => file.match(/^(packages\/[^/]+)\//)?.[1])
      .filter((root): root is string => Boolean(root)),
  );

  const blocks: string[] = [];
  for (const root of [...roots].sort()) {
    const path = join(REPO_ROOT, root, 'project.json');
    if (!existsSync(path)) continue;
    blocks.push(
      `### ${root}/project.json\n\n\`\`\`json\n${readFileSync(path, 'utf8').trim()}\n\`\`\``,
    );
  }

  return blocks.join('\n\n');
}

/**
 * Whether a colocated spec exists on disk, changed or not.
 *
 * This is what separates "the spec was omitted from the diff" from "there is no
 * spec" — the only sound basis for a missing-test finding.
 */
const specExists = (file: string): boolean => {
  if (SPEC.test(file) || STORIES.test(file)) return false;
  const stem = file.replace(/\.[cm]?[jt]sx?$/, '');
  return ['.spec.ts', '.spec.tsx'].some((suffix) => existsSync(join(REPO_ROOT, stem + suffix)));
};

function diffFor(scope: Scope, files: string[], base?: string): string {
  // Every flag here defends the parser against a git config that would change
  // the patch shape: quoted paths, absent or mnemonic prefixes, an external
  // differ, or ANSI colour inside the headers.
  const shape = [
    '--unified=3',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--src-prefix=a/',
    '--dst-prefix=b/',
  ];

  const args =
    scope.kind === 'staged'
      ? ['diff', '--cached', ...shape, '--', ...files]
      : ['diff', ...shape, `${base}...HEAD`, '--', ...files];

  return git(args);
}

export interface BuildOptions {
  budgetChars: number;
  maxFileChars: number;
  /** Overrides the commit-derived purpose. CI supplies the pull request body. */
  intentOverride?: string;
}

export function buildReviewContext(scope: Scope, options: BuildOptions): ReviewContext {
  // Resolved once, so the file list, the diff and the purpose provably describe
  // the same range.
  const base = scope.kind === 'base' ? mergeBase(scope.ref) : undefined;
  const allFiles = changedFiles(scope, base);
  const files = allFiles.filter((file) => REVIEWABLE.test(file));
  const { text: conventions, warnings } = codeReviewExpectations(
    readFileSync(join(__dirname, 'review-policy.md'), 'utf8'),
  );

  // No commit message exists before the commit does, so a staged review has no
  // stated purpose — and the guards that need one are disabled for that run.
  const intent = deriveIntent(base ? readCommitMessages(base) : [], options.intentOverride);

  if (files.length === 0) {
    return {
      files,
      allFiles,
      packed: {
        diff: '',
        files: [],
        included: [],
        omitted: [],
        budgetChars: options.budgetChars,
        usedChars: 0,
        complete: true,
      },
      truncated: false,
      projectMetadata: '',
      conventions,
      intent,
      warnings,
      base,
    };
  }

  const { segments, unattributed } = splitDiffByFile(diffFor(scope, files, base), files);
  for (const header of unattributed) {
    warnings.push(`diff segment could not be attributed to a changed file — ${header}`);
  }

  const packed = packDiff(segments, {
    budgetChars: options.budgetChars,
    maxFileChars: options.maxFileChars,
    specExists,
  });

  return {
    files,
    allFiles,
    packed,
    truncated: !packed.complete,
    projectMetadata: projectMetadataFor(files),
    conventions,
    intent,
    warnings,
    base,
  };
}
