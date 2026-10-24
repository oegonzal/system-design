import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';

import type { GoalDocument, GoalSource } from '../../core/ports';

/** A goal is a markdown file on disk; its hash is what groups sessions of the same mission. */
const GOAL_EXTENSION = '.md';

export class FsGoalSource implements GoalSource {
  async read(path: string): Promise<GoalDocument> {
    if (extname(path) !== GOAL_EXTENSION) {
      throw new Error(`a goal is a ${GOAL_EXTENSION} file: ${path}`);
    }
    const markdown = await readFile(path, 'utf8');
    if (markdown.trim() === '') throw new Error(`the goal at ${path} is empty`);
    return { path, markdown, hash: createHash('sha256').update(markdown).digest('hex') };
  }
}
