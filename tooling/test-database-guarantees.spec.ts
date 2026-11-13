import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import ts from 'typescript';
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
 *   the database first, in the same file: its first guard call
 *   (`ensureDatabase`, `assertTestDatabase`, `suiteDatabase`) comes before its
 *   first boot (`Test.createTestingModule`, `NestFactory.create*`,
 *   `MikroORM.init`, `new Client` / `new Pool`). A harness (`bootApp`,
 *   `createHarness`) does it at its own top; a spec that goes through a
 *   harness boots nothing itself and inherits the harness's guard.
 * - **By statement.** No source file under `packages/` — test code or not;
 *   migrations, which drop on purpose, and build output aside (`SKIP`) — but
 *   the pinned doors (`GUARDED`) empties a table, in any form named in
 *   `EMPTYING_CALLS` (the ORM's and query builder's methods) or
 *   `EMPTYING_SQL` (SQL spelled in a string). A file that does fails here,
 *   the form named, and is pointed at `truncateTestTables`; a door that no
 *   longer empties anything fails as a stale pin.
 *
 * Both rules read the TypeScript syntax tree, not the text: a call is a call
 * node, SQL is the content of a string, and a comment is neither. What they
 * cannot see through is a variable — `const all = {}; em.nativeDelete(X, all)`
 * passes — and a query builder's `where` added in a later statement is not
 * seen either, so that `delete()` is flagged. Each form is proven against a
 * sample below, so a rule that stops matching fails here too.
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

/** Every node of `source`'s syntax tree, in source order. */
function nodesOf(source: string, path = 'sample.ts'): ts.Node[] {
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return nodes;
}

/** An expression without the parentheses, type assertions and `!` around it. */
const bare = (node: ts.Expression): ts.Expression =>
  ts.isParenthesizedExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node) ||
  ts.isTypeAssertionExpression(node) ||
  ts.isNonNullExpression(node)
    ? bare(node.expression)
    : node;

/** The method a call invokes — `x.name(…)`, `x?.name(…)`, `x['name'](…)` — or null for a plain function call. */
function methodOf(call: ts.CallExpression): string | null {
  const callee = bare(call.expression);
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  if (ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression)) {
    return callee.argumentExpression.text;
  }
  return null;
}

/** The name a call invokes: a function's own, or a method's. */
const calleeOf = (call: ts.CallExpression): string | null => {
  const callee = bare(call.expression);
  return ts.isIdentifier(callee) ? callee.text : methodOf(call);
};

/** Whether `node` is `{}` — under any parentheses or type assertion. */
function isEmptyObject(node: ts.Expression | undefined): boolean {
  const value = node === undefined ? undefined : bare(node);
  return (
    value !== undefined && ts.isObjectLiteralExpression(value) && value.properties.length === 0
  );
}

/**
 * Every method called along `call`'s fluent chain but its own: the calls its
 * receiver was built by, and the calls made on its result —
 * `qb.where(w).delete().execute()` names `where` and `execute` for `delete`.
 */
function chainOf(call: ts.CallExpression): string[] {
  const names: string[] = [];
  const access = (
    node: ts.Node,
  ): node is ts.PropertyAccessExpression | ts.ElementAccessExpression =>
    ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node);
  for (let node = bare(call.expression); ;) {
    if (ts.isCallExpression(node)) {
      const name = methodOf(node);
      if (name !== null) names.push(name);
      node = bare(node.expression);
    } else if (access(node)) node = bare(node.expression);
    else break;
  }
  for (let node: ts.Node = call; ;) {
    const member = node.parent;
    const next = member?.parent;
    if (!access(member) || member.expression !== node) break;
    if (!next || !ts.isCallExpression(next) || next.expression !== member) break;
    const name = methodOf(next);
    if (name !== null) names.push(name);
    node = next;
  }
  return names;
}

/** `nativeDelete`'s filter: an entity manager's second argument, a repository's first (an object, where the manager's first is an entity). */
function filterOf(call: ts.CallExpression): ts.Expression | undefined {
  const [first, second] = call.arguments;
  return first !== undefined && ts.isObjectLiteralExpression(bare(first)) ? first : second;
}

/** The query builder's ways to narrow a statement. */
const WHERE = new Set(['where', 'andWhere', 'orWhere']);

/** The schema generator's ways to empty or remove every table at once. */
const SCHEMA_RESETS = new Set(['clearDatabase', 'refreshDatabase', 'dropSchema', 'dropDatabase']);

/** Every ORM call that empties a table, by name, so a miss names the form. */
const EMPTYING_CALLS: Readonly<Record<string, (call: ts.CallExpression) => boolean>> = {
  // `qb.truncate()`, `em.createQueryBuilder(X).truncate().execute()` — any method so named.
  'query builder truncate': (call) => methodOf(call) === 'truncate',
  // `em.nativeDelete(X, {})`, `em.getRepository(X).nativeDelete({})`, `{} as FilterQuery<X>`.
  'MikroORM delete with an empty filter': (call) =>
    methodOf(call) === 'nativeDelete' && isEmptyObject(filterOf(call)),
  // `qb.delete()` or `qb.delete({})`, with no `where` along its chain. A
  // `Map`'s or `Set`'s `delete` always takes a key, so it is never one.
  'query builder delete without a where': (call) =>
    methodOf(call) === 'delete' &&
    (call.arguments.length === 0 ||
      (call.arguments.length === 1 && isEmptyObject(call.arguments[0]))) &&
    !chainOf(call).some((name) => WHERE.has(name)),
  'MikroORM schema reset': (call) => SCHEMA_RESETS.has(methodOf(call) ?? ''),
};

/** How an interpolated value reads in the text of a string. */
const SUBSTITUTION = '${}';

/**
 * The text a string expression spells — a literal, a template, or a `+`
 * concatenation with one — every interpolated value read as `${}`. Null for
 * anything that is not a string.
 */
function textOf(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    return (
      node.head.text + node.templateSpans.map((span) => SUBSTITUTION + span.literal.text).join('')
    );
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const [left, right] = [textOf(bare(node.left)), textOf(bare(node.right))];
    return left === null && right === null
      ? null
      : (left ?? SUBSTITUTION) + (right ?? SUBSTITUTION);
  }
  return null;
}

/** Every SQL statement that empties a table, by name, read from the text of a string. */
const EMPTYING_SQL: Readonly<Record<string, RegExp>> = {
  // `truncate table x`, `truncate x`, `TRUNCATE ONLY "x"`, `truncate ${t}`.
  'SQL truncate': /\btruncate\s+(?:table\s+)?(?:only\s+)?(?:["`]|\$\{|[a-z_])/i,
  // A delete with no filter: the table token is taken whole (the lookahead
  // capture cannot backtrack), then anything but `where` / `using` follows.
  'SQL delete without a filter':
    /\bdelete\s+from\s+(?:only\s+)?(?=([\w."$`{}]+))\1(?!\s+(?:as\s+\w+\s+)?(?:where|using)\b)/i,
  'SQL drop': /\bdrop\s+(?:table|schema|database)\b/i,
};

const emptyingForms = (source: string, path?: string): string[] => {
  const found = new Set<string>();
  for (const node of nodesOf(source, path)) {
    if (ts.isCallExpression(node)) {
      for (const [form, matches] of Object.entries(EMPTYING_CALLS)) {
        if (matches(node)) found.add(form);
      }
    }
    const text = textOf(node);
    if (text === null) continue;
    for (const [form, pattern] of Object.entries(EMPTYING_SQL)) {
      if (pattern.test(text)) found.add(form);
    }
  }
  return [...Object.keys(EMPTYING_CALLS), ...Object.keys(EMPTYING_SQL)].filter((form) =>
    found.has(form),
  );
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

/** What opens a connection through a named entry point: `Test.createTestingModule(…)`, and so on. */
const BOOT_CALLS = new Map<string, ReadonlySet<string>>([
  ['Test', new Set(['createTestingModule'])],
  ['NestFactory', new Set(['create', 'createApplicationContext', 'createMicroservice'])],
  ['MikroORM', new Set(['init'])],
]);

/** What opens a raw Postgres connection: `new Client(…)`, `new pg.Pool(…)`. */
const BOOT_CONSTRUCTORS = new Set(['Client', 'Pool']);

/** What refuses a database that is not a test one, before anything connects — a call, never the definition. */
const GUARD_CALLS = new Set(['ensureDatabase', 'assertTestDatabase', 'suiteDatabase']);

function boots(node: ts.Node): boolean {
  if (ts.isCallExpression(node)) {
    const callee = bare(node.expression);
    return (
      ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      (BOOT_CALLS.get(callee.expression.text)?.has(callee.name.text) ?? false)
    );
  }
  if (ts.isNewExpression(node)) {
    const ctor = bare(node.expression);
    if (ts.isIdentifier(ctor)) return BOOT_CONSTRUCTORS.has(ctor.text);
    return (
      ts.isPropertyAccessExpression(ctor) &&
      ts.isIdentifier(ctor.expression) &&
      ctor.expression.text === 'pg' &&
      BOOT_CONSTRUCTORS.has(ctor.name.text)
    );
  }
  return false;
}

const guards = (node: ts.Node): boolean =>
  ts.isCallExpression(node) && GUARD_CALLS.has(calleeOf(node) ?? '');

/**
 * Whether `source` boots before it guards: its first boot comes before its
 * first guard, or it has a boot and no guard. Null when it boots nothing.
 */
const bootsUnguarded = (source: string, path?: string): boolean | null => {
  const nodes = nodesOf(source, path);
  const boot = nodes.find(boots);
  if (boot === undefined) return null;
  const guard = nodes.find(guards);
  return guard === undefined || guard.getStart() > boot.getStart();
};

describe('test database guarantees', () => {
  const files = sourceFiles(join(REPO, 'packages'));
  // Both scans read every source file under packages/ (hundreds of files); a GitHub runner took
  // 6 s where this machine takes 2 s (2026-11-13), past vitest's 5 s default.
  const SCAN_TIMEOUT = { timeout: 30_000 };
  const read = (path: string): string => readFileSync(path, 'utf8');

  it('finds the workspace it is meant to guard', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('only the guarded doors empty a table', SCAN_TIMEOUT, () => {
    const offenders = files
      .filter((path) => !GUARDED.includes(relative(path)))
      .map((path) => [relative(path), emptyingForms(read(path), path)] as const)
      .filter(([, forms]) => forms.length > 0)
      .map(([path, forms]) => `${path}: ${forms.join(', ')}`);
    expect(offenders, 'empty tables through truncateTestTables (@sysdesign/db)').toEqual([]);
    // A door that no longer empties anything is a stale pin.
    const idle = GUARDED.filter((door) => emptyingForms(read(join(REPO, door)), door).length === 0);
    expect(idle).toEqual([]);
  });

  it(
    'test code that boots an application or an ORM guards the database first, in the same file',
    SCAN_TIMEOUT,
    () => {
      const booting = files.filter(
        (path) => TEST_CODE.test(relative(path)) && bootsUnguarded(read(path), path) !== null,
      );
      // The harnesses and the specs that boot by hand are all found…
      expect(booting.map(relative)).toEqual(
        expect.arrayContaining([
          'packages/quality-loop/src/modules/http/testing.ts',
          'packages/studio-api/src/test/harness.ts',
          'packages/db/src/testing/ensure-database.ts',
          'packages/govcon/src/modules/app/testing.ts',
        ]),
      );
      // …and none of them boots before it guards.
      const unguarded = booting.filter((path) => bootsUnguarded(read(path), path));
      expect(unguarded.map(relative)).toEqual([]);
    },
  );
});

describe('the gate catches what it claims to', () => {
  it.each([
    ['query builder truncate', 'await em.createQueryBuilder(Prompt).truncate().execute();'],
    ['query builder truncate', 'await em.qb(Prompt).truncate();'],
    ['MikroORM delete with an empty filter', 'await em.nativeDelete(Prompt, {});'],
    ['MikroORM delete with an empty filter', 'await em.nativeDelete<Prompt>(Prompt, { });'],
    ['MikroORM delete with an empty filter', "await em.nativeDelete('Prompt', {}, { ctx });"],
    [
      'MikroORM delete with an empty filter',
      'await em.nativeDelete(Prompt, {} as FilterQuery<Prompt>);',
    ],
    ['MikroORM delete with an empty filter', 'await em.getRepository(Prompt).nativeDelete({});'],
    ['MikroORM delete with an empty filter', 'await repo.nativeDelete({} as never, { ctx });'],
    [
      'query builder delete without a where',
      'await em.createQueryBuilder(Prompt).delete().execute();',
    ],
    ['query builder delete without a where', 'await qb.delete({}).execute();'],
    ['query builder delete without a where', 'await em.qb(Prompt)["delete"]().execute();'],
    // A where added in a later statement is not along the chain.
    ['query builder delete without a where', 'qb.delete();\nqb.where({ id });'],
    ['MikroORM schema reset', 'await orm.schema.clearDatabase();'],
    ['MikroORM schema reset', 'await orm.getSchemaGenerator().refreshDatabase();'],
    ['MikroORM schema reset', 'await orm.schema.dropSchema({ wrap: false });'],
    ['MikroORM schema reset', 'await generator.dropDatabase(name);'],
    ['SQL truncate', `await c.query('truncate table "prompt" cascade');`],
    ['SQL truncate', `await c.query('truncate prompt cascade');`],
    ['SQL truncate', 'await c.execute(`TRUNCATE ONLY ${tables}`);'],
    ['SQL truncate', `await c.query('truncate table ' + name);`],
    ['SQL delete without a filter', `await c.query('delete from "prompt"');`],
    ['SQL delete without a filter', `await c.query('DELETE FROM public.prompt;');`],
    ['SQL delete without a filter', 'await c.execute(`delete from ${table}`);'],
    ['SQL delete without a filter', `await c.query('delete from ' + table);`],
    ['SQL drop', `await c.query('drop table "prompt"');`],
    ['SQL drop', `await c.query('DROP SCHEMA public CASCADE');`],
  ])('flags %s: %s', (form, statement) => {
    expect(emptyingForms(statement)).toEqual([form]);
  });

  it.each([
    // A delete that names what it deletes, through the ORM, its builder or SQL.
    'await em.nativeDelete(Prompt, { id });',
    'await em.nativeDelete(QualityRunFinding, owned);',
    'await em.nativeDelete(Prompt, { id }, {});',
    'await em.getRepository(Prompt).nativeDelete({ id });',
    'await repo.nativeDelete({ id }, {});',
    'await em.createQueryBuilder(Prompt).delete({ id }).execute();',
    'await qb.delete().where({ id }).execute();',
    'await qb.where({ id }).delete().execute();',
    'await qb.delete().andWhere({ id }).orWhere({ name }).execute();',
    `await c.query('delete from "prompt" where id = $1', [id]);`,
    `await c.query('DELETE FROM public.prompt WHERE id = $1');`,
    `await c.query('delete from "prompt" as p using "session" s where s.id = p.id');`,
    // A collection's delete takes a key; the operator is not a call.
    'cache.delete(key);',
    'delete process.env[key];',
    // The helper, a local named after the act, and a call to that local are not the act.
    'await truncateTestTables(em, [Prompt]);',
    'const truncate = async (em: EntityManager) => {};',
    'await truncate(em);',
    // Prose about it, in a comment of either kind.
    '// the e2e run can never truncate the dev database',
    '/* `truncate prompt cascade` and em.nativeDelete(Prompt, {}) */',
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
    expect(bootsUnguarded('const app = await NestFactory.create<App>(AppModule);')).toBe(true);
    expect(bootsUnguarded('const pool = new pg.Pool(options);')).toBe(true);
    // Defining the guard is not calling it.
    expect(
      bootsUnguarded(
        'export async function ensureDatabase() {}\nconst orm = await MikroORM.init(o);',
      ),
    ).toBe(true);
    // A guard named only in a comment, or a boot named only in a string, does nothing.
    expect(bootsUnguarded(`// await ensureDatabase();\n${boot}`)).toBe(true);
    expect(bootsUnguarded("const doc = 'MikroORM.init(o)';")).toBeNull();
    expect(bootsUnguarded('const { app } = await bootApp([]);')).toBeNull();
  });
});
