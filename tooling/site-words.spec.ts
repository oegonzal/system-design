import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The goals are the only place a site or a line of work may be named. The
 * engine that runs a mission — the browser session, its settings, its contracts, and the
 * pipelines and orchestrators the session drives, or a memory space files a
 * text through — is written about the shape of the work: a page, a form, a
 * unit of work, the subject the answers are about, a text and its registers.
 * A site's name or a line of work's role word in that code, or in a persona a
 * model reads, is one case wearing an abstraction, and the same program must
 * run any goal.
 *
 * Specs, spec builders and recorded fixtures may carry a concrete example;
 * the code and the personas may not.
 */
const WORKSPACE = join(__dirname, '..');
const ENGINE = [
  'packages/browser-session/src',
  'packages/browser-session/config',
  'packages/contracts/src/lib/browser-session',
  'packages/contracts/src/lib/units',
  'packages/contracts/src/lib/tool-session',
  'packages/tool-session/src',
  'packages/quality-loop/src/pipelines/browser-step',
  'packages/quality-loop/src/pipelines/tool-step',
  'packages/quality-loop/src/pipelines/field-answer',
  'packages/quality-loop/src/pipelines/answer-suggestions',
  'packages/quality-loop/src/pipelines/document-digest',
  'packages/quality-loop/src/pipelines/register-digest',
  'packages/quality-loop/src/orchestrators/form-memory',
  'packages/quality-loop/src/orchestrators/document-memory',
  'packages/quality-loop/src/orchestrators/register-memory',
];
/**
 * The sites the shipped goals name, the role words of the line of work they
 * pursue, and the channel the operator is reached on beyond the terminal —
 * the session asks the notifications service, which alone knows its channels.
 */
const FORBIDDEN = [
  'linkedin',
  // The one-word site name: its two-word form would match "built inline" in an orchestrator's prose.
  'builtin',
  'duckduckgo',
  'easy apply',
  'applicant',
  'recruiter',
  'telegram',
  'gmail',
  'google',
  'calendar',
  'inbox',
];
/** Where a concrete example belongs: a spec, a spec's builder, a fixture module or a recorded fixture. */
const EXAMPLE = /(\.spec\.ts$|testing(-[a-z]+)?\.ts$|\.testing\.ts$|\/fixtures(\/|\.ts$))/;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

describe('the engine', () => {
  it('[BRW-8] names no site and no line of work — in code or in a persona a model reads — outside a goal', () => {
    const offenders = ENGINE.flatMap((dir) => files(join(WORKSPACE, dir)))
      .filter((path) => /\.(ts|md|json)$/.test(path) && !EXAMPLE.test(path))
      .flatMap((path) => {
        const text = readFileSync(path, 'utf8').toLowerCase();
        return FORBIDDEN.filter((word) => text.includes(word)).map(
          (word) => `${path.slice(WORKSPACE.length + 1)}: ${word}`,
        );
      });
    expect(offenders).toEqual([]);
  });
});
