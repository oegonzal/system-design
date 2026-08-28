import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = join(__dirname, '../..');

export interface RepoProject {
  name: string;
  root: string;
  type: string;
  tags: string[];
}

export interface RepoMap {
  projects: RepoProject[];
  rules: string[];
}

/**
 * A small architecture map for the critics.
 *
 * Generated rather than written down, from the two places that already describe
 * this repo's structure: the Nx project graph, and the `depConstraints` in
 * `eslint.config.mjs` that `@nx/enforce-module-boundaries` enforces. A hand
 * written map would be a third description of the same thing and would drift
 * from the other two the first time a project moved.
 *
 * Note this repo has no `apps/` directory — everything lives under `packages/`,
 * and the app/library distinction is carried by Nx `projectType` and `type:*`
 * tags. The map surfaces both so a critic judges placement against what the
 * repo actually enforces.
 */
export function buildRepoMap(): RepoMap {
  return { projects: readProjects(), rules: readRules() };
}

function readProjects(): RepoProject[] {
  const names = JSON.parse(
    execFileSync('pnpm', ['exec', 'nx', 'show', 'projects', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }),
  ) as string[];

  return names
    .map((name) => {
      const project = JSON.parse(
        execFileSync('pnpm', ['exec', 'nx', 'show', 'project', name, '--json'], {
          cwd: REPO_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }),
      ) as { root: string; projectType?: string; tags?: string[] };

      return {
        name,
        root: project.root,
        type: project.projectType ?? 'unknown',
        tags: project.tags ?? [],
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Lifts the tag constraints out of the eslint config by regex.
 *
 * Importing the config would drag the whole plugin graph into this script for a
 * handful of strings, and the shape being matched is a literal in a file this
 * repo owns. If the parse finds nothing, the code below refuses rather than
 * silently handing the critic an empty rule set.
 */
function readRules(): string[] {
  const source = readFileSync(join(REPO_ROOT, 'eslint.config.mjs'), 'utf8');

  const rules: string[] = [];
  const pattern = /sourceTag:\s*'([^']+)'[\s\S]{0,200}?onlyDependOnLibsWithTags:\s*\[([^\]]*)\]/g;

  for (const [, sourceTag, allowed] of source.matchAll(pattern)) {
    const targets = [...allowed.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    rules.push(
      targets.includes('*')
        ? `${sourceTag} may depend on any project`
        : `${sourceTag} may depend only on ${targets.join(', ')}`,
    );
  }

  // Fail rather than substitute a guess. This regex is coupled to the textual
  // layout of a file it does not own, so a reformat there could silently stop
  // it matching — and a critic quietly told a made-up rule set is worse than a
  // review that refuses to run.
  if (rules.length === 0) {
    throw new Error(
      'no depConstraints found in eslint.config.mjs — the architecture rules could not be ' +
        'derived, so the review would be judging against nothing. Check that the ' +
        'enforce-module-boundaries configuration still matches the expected shape.',
    );
  }

  rules.push(
    'Domain-specific components stay in studio-ui; only presentation-focused, ' +
      'broadly reusable code belongs in the shared design system.',
  );

  return rules;
}
