import type { Finding } from '../policy';
import type { ChangedFile } from './index';

/**
 * Lines, not characters, and generous on purpose.
 *
 * 400 lines is not where a file becomes bad; it is where "one responsibility"
 * stops being the likely explanation and starts being a claim the author
 * should have to make. That is exactly a `medium`: the commit proceeds, the
 * reviewer is told, and the readability critic — which can actually judge the
 * content — has a deterministic pointer at the file most worth its budget.
 */
export const MAX_LINES = 400;

const SOURCE = /\.(ts|tsx)$/;

/** `medium` for any changed TypeScript file that has grown past the cap. */
export const fileSize = (files: readonly ChangedFile[]): Finding[] => {
  const findings: Finding[] = [];

  for (const { file, content } of files) {
    if (!SOURCE.test(file) || content === undefined) continue;

    const lines = content.split('\n').length;
    if (lines <= MAX_LINES) continue;

    findings.push({
      severity: 'medium',
      file,
      category: 'oversized-file',
      evidence: `${lines} lines (limit ${MAX_LINES})`,
      problem: `The file is ${lines} lines — past the point where a single responsibility remains the likely explanation.`,
      recommendation:
        'Split by responsibility: extract the piece with its own reason to change into its own module, with its own spec.',
    });
  }

  return findings;
};
