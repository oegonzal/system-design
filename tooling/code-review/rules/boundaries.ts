import type { Finding } from '../policy';
import type { ChangedFile } from './index';

/**
 * The dependency matrix, in the direction the architecture enforces it.
 *
 * This is the same information `@nx/enforce-module-boundaries` holds as tag
 * rules, restated per package so a violation can be named without running
 * eslint — the review pipeline must be able to say "studio-ui imported db"
 * in a pre-commit hook that has not linted yet, and in CI runs where only the
 * review job executes. eslint remains the enforcement of record; this is the
 * reviewer that explains.
 *
 *   contracts      -> (nothing)         the shared vocabulary; the root of the graph
 *   criteria       -> contracts         completion criteria as data
 *   db             -> contracts         MikroORM entities and migrations
 *   config-kit     -> (nothing)         a program's configuration chosen by name from its config folder
 *   qdrant-kit     -> contracts         a Qdrant collection's name, client and boot-time ensure, for every store over Qdrant
 *   llm            -> contracts, config-kit   provider adapters
 *   run-dump       -> (nothing)         run-folder plumbing for pipeline dumps
 *   nest-kit       -> contracts, db     the Nest apps' shared plumbing (zod pipe, db root, cors, health)
 *   design-system  -> contracts         tokens and domain-free primitives
 *   web-kit        -> contracts, design-system   the Next apps' runtime plumbing
 *   web-testing    -> contracts, design-system   the web spec harness
 *   studio-ui      -> contracts, design-system, web-kit, web-testing
 *   quality-loop-ui -> contracts, design-system, web-kit, web-testing
 *   govcon-ui      -> contracts, design-system, web-kit, web-testing
 *   loop-client    -> contracts         the quality loop as one port, its HTTP adapter and the errors both raise
 *   google-kit     -> contracts         Google's OAuth consent and refresh, the token file, and the authorized request
 *   studio-testing -> contracts, loop-client   the quality loop as a scriptable fake, shared by studio-api's specs and the e2e stub
 *   studio-api     -> contracts, db, nest-kit, loop-client, studio-testing (specs and the test folder only)
 *   quality-loop   -> contracts, db, llm, run-dump, nest-kit, qdrant-kit
 *   govcon         -> contracts, db, nest-kit, notifications-client, loop-client, studio-testing (specs)   SAM.gov opportunities: search, store, rank; introductions through the loop
 *   notifications-client -> contracts   the notifications bus as one port, its HTTP adapter, and asking a person through it
 *   tool-session   -> contracts, nest-kit, loop-client, notifications-client, db (the test-database guard only)   a mission run as tool calls the loop decides, for any program that declares tools
 *   browser-session -> contracts, db, nest-kit, run-dump, loop-client, notifications-client, config-kit, studio-testing (specs only)   a Playwright session the loop decides for
 *   memory-ingest  -> contracts, loop-client, studio-testing (specs only)   documents chunked and handed to the loop
 *   notifications  -> contracts, db, nest-kit, config-kit   the event bus, and the channels that put prompts to people
 *   job-application -> contracts, db, nest-kit, config-kit, notifications-client   the record of units a session applied to, and the advisor over it
 *   agentic-memory -> contracts, db, qdrant-kit   a memory strategy executed: typed writes, hybrid recall, consolidation and the sweep, over Postgres and a Qdrant projection
 *   agentic-system -> contracts, db, nest-kit, config-kit, loop-client, notifications-client, agentic-memory, llm (the embedding client only; completions stay on the loop), qdrant-kit   designs agentic-memory strategies on the loop, keeps the cycle table, learns from the runs, announces each cycle on the bus, and serves memory spaces
 *   gmail          -> contracts, nest-kit, config-kit, google-kit, tool-session, loop-client, notifications-client, db (the test-database guard only)   the mailbox as tools, and missions over them
 *   google-calendar -> contracts, nest-kit, config-kit, google-kit, tool-session, loop-client, notifications-client, db (the test-database guard only)   the calendar as tools, and missions over them
 *   website        -> (nothing)         the Enfav marketing site, statically built with Astro; it imports no workspace package
 *   storybook      -> (anything)        the catalog host legitimately sees both sides
 *   studio-e2e     -> (anything)        drives the whole stack by definition
 *   website-e2e    -> (anything)        drives the built site through a browser, as studio-e2e drives the stack, and reads the company and founder data the site declares
 *
 * `null` means unconstrained — the `type:tooling` tag in eslint.config.mjs.
 */
export const ALLOWED: Record<string, readonly string[] | null> = {
  contracts: [],
  criteria: ['contracts'],
  db: ['contracts'],
  'config-kit': [],
  'qdrant-kit': ['contracts'],
  llm: ['contracts', 'config-kit'],
  'run-dump': [],
  'nest-kit': ['contracts', 'db'],
  'design-system': ['contracts'],
  'web-kit': ['contracts', 'design-system'],
  'web-testing': ['contracts', 'design-system'],
  'studio-ui': ['contracts', 'design-system', 'web-kit', 'web-testing'],
  'quality-loop-ui': ['contracts', 'design-system', 'web-kit', 'web-testing'],
  'govcon-ui': ['contracts', 'design-system', 'web-kit', 'web-testing'],
  'loop-client': ['contracts'],
  'google-kit': ['contracts'],
  'notifications-client': ['contracts'],
  'agentic-memory': ['contracts', 'db', 'qdrant-kit'],
  'tool-session': ['contracts', 'nest-kit', 'loop-client', 'notifications-client', 'db'],
  'studio-testing': ['contracts', 'loop-client'],
  'studio-api': ['contracts', 'db', 'nest-kit', 'loop-client', 'studio-testing'],
  'quality-loop': ['contracts', 'db', 'llm', 'run-dump', 'nest-kit', 'qdrant-kit'],
  govcon: ['contracts', 'db', 'nest-kit', 'notifications-client', 'loop-client', 'studio-testing'],
  'browser-session': [
    'contracts',
    'db',
    'nest-kit',
    'run-dump',
    'loop-client',
    'notifications-client',
    'config-kit',
    'studio-testing',
  ],
  'memory-ingest': ['contracts', 'loop-client', 'studio-testing'],
  notifications: ['contracts', 'db', 'nest-kit', 'config-kit'],
  'job-application': ['contracts', 'db', 'nest-kit', 'config-kit', 'notifications-client'],
  'agentic-system': [
    'contracts',
    'db',
    'nest-kit',
    'config-kit',
    'loop-client',
    'notifications-client',
    'agentic-memory',
    'llm',
    'qdrant-kit',
  ],
  gmail: [
    'contracts',
    'nest-kit',
    'config-kit',
    'google-kit',
    'tool-session',
    'loop-client',
    'notifications-client',
    'db',
  ],
  'google-calendar': [
    'contracts',
    'nest-kit',
    'config-kit',
    'google-kit',
    'tool-session',
    'loop-client',
    'notifications-client',
    'db',
  ],
  website: [],
  storybook: null,
  'studio-e2e': null,
  'website-e2e': null,
};

/** The workspace alias prefix every package is published under internally. */
export const ALIAS_SCOPE = '@sysdesign/';

const SOURCE = /\.(ts|tsx)$/;

export interface ImportRef {
  line: number;
  /** The full line, quoted as evidence. */
  text: string;
  specifier: string;
}

/**
 * Every import specifier in a file, with its line number.
 *
 * Line-based on purpose: a specifier is a string literal, so however a
 * multi-line import statement wraps, the `from '...'` (or the bare
 * `import '...'` / `require('...')`) always terminates on a single line —
 * which is the line a finding should point at.
 */
export function importsOf(content: string): ImportRef[] {
  const refs: ImportRef[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/,
    /^\s*import\s+['"]([^'"]+)['"]/,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/,
  ];

  content.split('\n').forEach((text, index) => {
    for (const pattern of patterns) {
      const match = pattern.exec(text);
      if (match?.[1]) {
        refs.push({ line: index + 1, text: text.trim(), specifier: match[1] });
        return; // one specifier per line is how this repo writes imports
      }
    }
  });

  return refs;
}

/** `packages/<name>/...` -> `<name>`, or undefined outside packages/. */
export const packageOf = (file: string): string | undefined =>
  /^packages\/([^/]+)\//.exec(file)?.[1];

/**
 * Resolves a relative specifier against the importing file, in repo-relative
 * terms. Pure string arithmetic — no filesystem — so a fixture can exercise it.
 */
export function resolveRelative(fromFile: string, specifier: string): string {
  const parts = fromFile.split('/').slice(0, -1);
  for (const piece of specifier.split('/')) {
    if (piece === '' || piece === '.') continue;
    if (piece === '..') parts.pop();
    else parts.push(piece);
  }
  return parts.join('/');
}

const finding = (
  file: string,
  ref: ImportRef,
  severity: Finding['severity'],
  category: string,
  problem: string,
  recommendation: string,
): Finding => ({
  severity,
  file,
  line: ref.line,
  category,
  evidence: ref.text,
  problem,
  recommendation,
});

/**
 * Scans changed TypeScript files for imports the architecture forbids.
 *
 * Three shapes of violation, in order of directness:
 *
 * 1. `@sysdesign/<pkg>` where the importing package's row does not allow
 *    `<pkg>` — the matrix violation, `high`.
 * 2. A relative path that escapes the importing package into one it may not
 *    depend on — the same violation wearing a disguise the alias-based lint
 *    rule may not see, also `high`. (A relative path into an *allowed*
 *    package is export-surface's concern: wrong spelling, right direction.)
 * 3. `@sysdesign/<pkg>/anything` — a deep import. Even into an allowed
 *    package this couples the importer to internal layout the barrel exists
 *    to hide, so it is `medium` on its own and `high` when the target is
 *    disallowed anyway.
 */
export const boundaries = (files: readonly ChangedFile[]): Finding[] => {
  const findings: Finding[] = [];

  for (const { file, content } of files) {
    if (!SOURCE.test(file) || content === undefined) continue;
    const ownPackage = packageOf(file);
    const allowed = ownPackage !== undefined ? ALLOWED[ownPackage] : undefined;

    for (const ref of importsOf(content)) {
      const { specifier } = ref;

      if (specifier.startsWith(ALIAS_SCOPE)) {
        const [target, ...rest] = specifier.slice(ALIAS_SCOPE.length).split('/');
        const deep = rest.length > 0;
        const disallowed =
          allowed !== undefined && allowed !== null && !allowed.includes(target ?? '');

        if (disallowed) {
          findings.push(
            finding(
              file,
              ref,
              'high',
              'boundary-violation',
              `${ownPackage} may not depend on ${target} — the dependency matrix allows only: ${
                (allowed as readonly string[]).join(', ') || '(nothing)'
              }.`,
              `Move the shared piece into a package both sides may depend on (usually contracts), or invert the dependency.`,
            ),
          );
        } else if (deep) {
          findings.push(
            finding(
              file,
              ref,
              'medium',
              'deep-import',
              `Deep import into ${ALIAS_SCOPE}${target} — reaching past the barrel couples this file to that package's internal layout.`,
              `Import from '${ALIAS_SCOPE}${target}' and re-export the symbol from its index if it is meant to be public.`,
            ),
          );
        }
        continue;
      }

      if (specifier.startsWith('.') && ownPackage !== undefined) {
        const resolved = resolveRelative(file, specifier);
        const targetPackage = packageOf(`${resolved}/`);
        if (targetPackage !== undefined && targetPackage !== ownPackage) {
          const escapesMatrix = allowed !== null && !(allowed ?? []).includes(targetPackage);
          if (escapesMatrix) {
            findings.push(
              finding(
                file,
                ref,
                'high',
                'boundary-violation',
                `Relative import escapes ${ownPackage} into ${targetPackage}, which the dependency matrix does not allow — and being relative, it also bypasses the lint rule that would have said so.`,
                `Remove the dependency, or move the shared piece into a package both sides may depend on.`,
              ),
            );
          }
          // An allowed target reached relatively is export-surface's finding:
          // right direction, wrong spelling. One rule per problem.
        }
      }
    }
  }

  return findings;
};
