import { SOURCE } from '../diff-pack';
import type { Finding } from '../policy';
import type { ChangedFile } from './index';

/**
 * Two bounds on a source file's length, in lines, and generous on purpose.
 *
 * `warn`: not where a file becomes bad, but where "one responsibility" stops
 * being the likely explanation and starts being a claim the author should have
 * to make. That is exactly a `medium`: the commit proceeds, the reviewer is
 * told, and the readability critic — which can actually judge the content —
 * has a deterministic pointer at the file most worth its budget.
 *
 * `max`: where no claim is enough. A `high` refuses the commit, and
 * `tooling/file-size.spec.ts` holds every tracked file to the same bound, so a
 * file that never passes through a review cannot carry it in either.
 */
export const LINE_BOUNDS = { warn: 400, max: 500 } as const;

/** Lines as an editor counts them: the last line needs no newline after it. */
export const lineCount = (content: string): number => {
  const breaks = content.split('\n').length - 1;
  return content === '' || content.endsWith('\n') ? breaks : breaks + 1;
};

/** `medium` for a changed source file past the warning bound, `high` past the hard one. */
export const fileSize = (files: readonly ChangedFile[]): Finding[] => {
  const findings: Finding[] = [];

  for (const { file, content } of files) {
    if (!SOURCE.test(file) || content === undefined) continue;

    const lines = lineCount(content);
    if (lines <= LINE_BOUNDS.warn) continue;

    findings.push(
      lines > LINE_BOUNDS.max
        ? {
            severity: 'high',
            file,
            category: 'oversized-file',
            evidence: `${lines} lines (bound ${LINE_BOUNDS.max})`,
            problem: `The file is ${lines} lines — past the ${LINE_BOUNDS.max}-line bound no source file in this repository may cross.`,
            recommendation:
              'Split it by responsibility before committing: each piece with its own reason to change goes to its own module, with its own spec.',
          }
        : {
            severity: 'medium',
            file,
            category: 'oversized-file',
            evidence: `${lines} lines (limit ${LINE_BOUNDS.warn})`,
            problem: `The file is ${lines} lines — past the point where a single responsibility remains the likely explanation.`,
            recommendation:
              'Split by responsibility: extract the piece with its own reason to change into its own module, with its own spec.',
          },
    );
  }

  return findings;
};
