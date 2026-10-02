import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Tests reach Postgres through guarded doors only.
 *
 * Every suite that touches Postgres resets it by emptying tables, and the one
 * thing that must never happen is a reset landing on someone's data. The
 * guard (`packages/db/src/testing/test-database.ts`) refuses any database
 * that is not a test one; this gate keeps it unavoidable, two ways:
 *
 * - **Structurally.** Test code that boots an application or an ORM guards
 *   the database first, in the same file: a harness (`bootApp`,
 *   `createHarness`) does it at its own top, and a spec that boots by hand
 *   calls `ensureDatabase` before it does. A spec that goes through a harness
 *   boots nothing itself and inherits the harness's guard.
 * - **By statement.** Only the pinned doors may issue a statement that
 *   empties a table, in any of the forms SQL and MikroORM spell it. A suite
 *   that empties one by hand fails here, and is pointed at
 *   `truncateTestTables`.
 *
 * Both rules read code with its comments blanked, so prose about truncating
 * is never mistaken for a statement — and each form is proven against a
 * sample below, so a pattern that stops matching fails here too.
 */
const REPO = join(__dirname, '..');
const SKIP = new Set([
  'node_modules',
  'dist',
  '.next',
  '.next-dev',
  '.next-e2e',
  'storybook-static',
  'migrations',
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (SKIP.has(entry)) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts)$/.test(entry) ? [path] : [];
  });
}

const relative = (path: string): string => path.slice(REPO.length + 1);

/**
 * Source with its comments blanked. A `//` after a colon or inside a quote is
 * kept, so a URL is not read as a comment.
 */
const codeOf = (source: string): string =>
  source.replace(
    /\/\*[\s\S]*?\*\/|(^|[^:'"`\\])\/\/.*$/gm,
    (_match, lead: string | undefined) => lead ?? '',
  );

/** Every way a statement empties a table, by name, so a miss names the form. */
const EMPTYING_FORMS: Readonly<Record<string, RegExp>> = {
  // `truncate table x`, `truncate x`, `TRUNCATE ONLY "x"`, `truncate ${t}`.
  'SQL truncate': /\btruncate\s+(?:table\s+)?(?:only\s+)?(?:["`]|\$\{|[a-z_])/i,
  // A delete with no filter: the table token is taken whole (the lookahead
  // capture cannot backtrack), then anything but `where` / `using` follows.
  'SQL delete without a filter':
    /\bdelete\s+from\s+(?:only\s+)?(?=([\w."$`{}]+))\1(?!\s+(?:as\s+\w+\s+)?(?:where|using)\b)/i,
  'SQL drop': /\bdrop\s+(?:table|schema|database)\b/i,
  // `nativeDelete(X, {})`, `nativeDelete<X>(X, {})`, `nativeDelete('X', {}, options)`,
  // `nativeDelete(X, {} as FilterQuery<X>)`.
  'MikroORM delete with an empty filter':
    /\.nativeDelete\s*(?:<[^>()]*>)?\(\s*[^,()]+,\s*\{\s*\}\s*(?:as\s+[^,()]+)?[,)]/,
  // The schema generator's ways to empty or remove every table at once.
  'MikroORM schema reset': /\.(?:clearDatabase|refreshDatabase|dropSchema|dropDatabase)\s*\(/,
};

const emptyingForms = (source: string): string[] => {
  const code = codeOf(source);
  return Object.entries(EMPTYING_FORMS)
    .filter(([, pattern]) => pattern.test(code))
    .map(([name]) => name);
};

/** The doors, each guarded before it deletes. */
const GUARDED = [
  // Asks the connection which database it is on, and refuses unless a test one.
  'packages/db/src/testing/truncate-test-tables.ts',
  // Runs under Playwright's transform, which cannot load the entities the
  // helper names tables by; refuses through `suiteDatabase()` first.
  'packages/studio-e2e/src/support/global-setup.ts',
  // The guard's own spec: it asserts the statement text against a recording
  // fake, and no connection exists.
  'packages/db/src/testing/test-database.spec.ts',
];

/** Test code: specs, test support, and the e2e suite — never a shipped entry point, which boots on purpose. */
const TEST_CODE =
  /\.spec\.tsx?$|(?:^|\/|\.)testing\.ts$|\/(?:testing|test)\/|^packages\/[^/]+-e2e\//;

/** What opens a connection: a Nest application over modules, an ORM, or a raw Postgres client. */
const BOOTS =
  /\bTest\.createTestingModule\s*\(|\bNestFactory\.create(?:ApplicationContext|Microservice)?\s*\(|\bMikroORM\.init\s*\(|\bnew\s+(?:pg\.)?(?:Client|Pool)\s*\(/;

/** What refuses a database that is not a test one, before anything connects — a call, never the definition. */
const GUARDS = /(?<!function\s+)\b(?:ensureDatabase|assertTestDatabase|suiteDatabase)\s*\(/;

/**
 * Whether `source` boots before it guards: its first boot comes before its
 * first guard, or it has a boot and no guard. Null when it boots nothing.
 */
const bootsUnguarded = (source: string): boolean | null => {
  const code = codeOf(source);
  const boot = code.search(BOOTS);
  if (boot === -1) return null;
  const guard = code.search(GUARDS);
  return guard === -1 || guard > boot;
};

describe('test database guarantees', () => {
  const files = sourceFiles(join(REPO, 'packages'));

  it('finds the workspace it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('only the guarded doors empty a table', () => {
    const emptying = files.filter((path) => emptyingForms(readFileSync(path, 'utf8')).length > 0);
    expect(emptying.map(relative).sort()).toEqual([...GUARDED].sort());
  });

  it('test code that boots an application or an ORM guards the database first, in the same file', () => {
    const booting = files.filter(
      (path) =>
        TEST_CODE.test(relative(path)) && bootsUnguarded(readFileSync(path, 'utf8')) !== null,
    );
    // The harnesses and the specs that boot by hand are all found…
    expect(booting.map(relative)).toEqual(
      expect.arrayContaining([
        'packages/quality-loop/src/modules/http/testing.ts',
        'packages/studio-api/src/test/harness.ts',
        'packages/db/src/testing/ensure-database.ts',
        'packages/govcon/src/modules/app/http.spec.ts',
      ]),
    );
    // …and none of them boots before it guards.
    const unguarded = booting.filter((path) => bootsUnguarded(readFileSync(path, 'utf8')));
    expect(unguarded.map(relative)).toEqual([]);
  });
});

describe('the gate catches what it claims to', () => {
  it.each([
    ['SQL truncate', `await c.query('truncate table "prompt" cascade');`],
    ['SQL truncate', `await c.query('truncate prompt cascade');`],
    ['SQL truncate', 'await c.execute(`TRUNCATE ONLY ${tables}`);'],
    ['SQL delete without a filter', `await c.query('delete from "prompt"');`],
    ['SQL delete without a filter', `await c.query('DELETE FROM public.prompt;');`],
    ['SQL delete without a filter', 'await c.execute(`delete from ${table}`);'],
    ['SQL drop', `await c.query('drop table "prompt"');`],
    ['SQL drop', `await c.query('DROP SCHEMA public CASCADE');`],
    ['MikroORM delete with an empty filter', 'await em.nativeDelete(Prompt, {});'],
    ['MikroORM delete with an empty filter', 'await em.nativeDelete<Prompt>(Prompt, { });'],
    ['MikroORM delete with an empty filter', "await em.nativeDelete('Prompt', {}, { ctx });"],
    [
      'MikroORM delete with an empty filter',
      'await em.nativeDelete(Prompt, {} as FilterQuery<Prompt>);',
    ],
    ['MikroORM schema reset', 'await orm.schema.clearDatabase();'],
    ['MikroORM schema reset', 'await orm.getSchemaGenerator().refreshDatabase();'],
    ['MikroORM schema reset', 'await orm.schema.dropSchema({ wrap: false });'],
    ['MikroORM schema reset', 'await generator.dropDatabase(name);'],
  ])('flags %s: %s', (form, statement) => {
    expect(emptyingForms(statement)).toEqual([form]);
  });

  it.each([
    // A delete that names what it deletes, through the ORM or in SQL.
    'await em.nativeDelete(Prompt, { id });',
    'await em.nativeDelete(QualityRunFinding, owned);',
    `await c.query('delete from "prompt" where id = $1', [id]);`,
    `await c.query('DELETE FROM public.prompt WHERE id = $1');`,
    `await c.query('delete from "prompt" as p using "session" s where s.id = p.id');`,
    // The helper and a local named after the act are not the act.
    'await truncateTestTables(em, [Prompt]);',
    'const truncate = async (em: EntityManager) => {};',
    // Prose about it, in a comment of either kind.
    '// the e2e run can never truncate the dev database',
    '/* `truncate prompt cascade` takes sessions with it */',
    // A URL is not a comment, and carries nothing either way.
    "const url = 'http://localhost/truncate';",
  ])('leaves alone: %s', (statement) => {
    expect(emptyingForms(statement)).toEqual([]);
  });

  it('reads a boot before its guard, a guard before its boot, and a file that boots nothing', () => {
    const boot = 'const app = await Test.createTestingModule({ imports: [AppModule] }).compile();';
    expect(bootsUnguarded(`${boot}\nawait ensureDatabase();`)).toBe(true);
    expect(bootsUnguarded(boot)).toBe(true);
    expect(bootsUnguarded(`await ensureDatabase();\n${boot}`)).toBe(false);
    expect(bootsUnguarded(`await ensureDatabase();\nconst orm = await MikroORM.init(o);`)).toBe(
      false,
    );
    expect(
      bootsUnguarded(`const db = suiteDatabase();\nconst c = new Client({ database: db });`),
    ).toBe(false);
    // Defining the guard is not calling it.
    expect(
      bootsUnguarded(
        'export async function ensureDatabase() {}\nconst orm = await MikroORM.init(o);',
      ),
    ).toBe(true);
    // A guard named only in a comment guards nothing.
    expect(bootsUnguarded(`// await ensureDatabase();\n${boot}`)).toBe(true);
    expect(bootsUnguarded('const { app } = await bootApp([]);')).toBeNull();
  });
});
