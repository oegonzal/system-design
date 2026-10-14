import type { ReviewContext } from './context';
import type { PackedFile } from './diff-pack';
import type { RepoMap } from './repo-map';

/** A review's context as the specs build it: one shown file, a stated purpose, the conventions line. */

export const packedFile = (
  file: string,
  status: PackedFile['status'] = 'included',
): PackedFile => ({
  file,
  status,
  chars: status === 'omitted' ? 0 : 40,
  totalChars: 40,
  added: 4,
  removed: 0,
  hasColocatedSpec: false,
});

export const reviewContext = (over: Partial<ReviewContext> = {}): ReviewContext => ({
  files: ['a.ts'],
  allFiles: ['a.ts'],
  packed: {
    diff: 'diff --git a/a.ts b/a.ts\n+shown',
    files: [packedFile('a.ts')],
    included: ['a.ts'],
    omitted: [],
    budgetChars: 1_000,
    usedChars: 40,
    complete: true,
  },
  truncated: false,
  projectMetadata: '',
  conventions: '- preserve clear ownership and dependency boundaries',
  intent: { text: 'Add the settings page.', source: 'commits', commitCount: 1, truncated: false },
  warnings: [],
  ...over,
});

export const REPO_MAP: RepoMap = {
  projects: [
    { name: 'contracts', root: 'packages/contracts', type: 'library', tags: ['type:shared'] },
  ],
  rules: ['type:shared may depend only on type:shared'],
};
