import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { build } from 'astro';
import { afterAll, describe, expect, it } from 'vitest';

import site from '../astro.config';
import { watchedInputs } from './watched-inputs';

/** This repository's node_modules, which each fixture links to as its own. */
const NODE_MODULES = join(__dirname, '..', '..', '..', 'node_modules');
/** A build of a fixture takes a few seconds. */
const BUILD_TIMEOUT = 60_000;

const made: string[] = [];
afterAll(() => made.forEach((path) => rmSync(path, { recursive: true, force: true })));

/** A repository laid out as this one is, holding the given files; returns the site's folder. */
function fixture(files: Record<string, string>): string {
  const repository = mkdtempSync(join(tmpdir(), 'watched-build-'));
  made.push(repository);
  symlinkSync(NODE_MODULES, join(repository, 'node_modules'));
  for (const [path, text] of Object.entries({ '.gitignore': 'dist\nnode_modules\n', ...files })) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), text);
  }
  return join(repository, 'packages', 'website');
}

/** Builds a fixture the way project.json builds the site: from its own folder, with the site's Vite settings. */
async function buildSite(root: string, vite = site.vite): Promise<void> {
  const from = process.cwd();
  process.chdir(root);
  try {
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      integrations: [watchedInputs()],
      vite: { ...vite, cacheDir: join(root, '.vite') },
    });
  } finally {
    process.chdir(from);
  }
}

const page = (frontmatter = '', text = 'Site') =>
  `---\n${frontmatter}\nimport '../styles/site.css';\n---\n<p class="underline">${text}</p>\n`;

describe('the build records what it reads', () => {
  it(
    '[SITE-6] builds a site that reads only itself and node_modules',
    async () => {
      const root = fixture({
        'packages/website/src/pages/index.astro': page(),
        'packages/website/src/styles/site.css': "@import 'tailwindcss' source('../');\n",
        'packages/website/public/robots.txt': 'User-agent: *\n',
      });

      await expect(buildSite(root)).resolves.toBeUndefined();
    },
    BUILD_TIMEOUT,
  );

  it(
    '[SITE-6] fails on a module, a content config import, a stylesheet, a Tailwind plugin, a scanned folder, an asset and a public file outside the package, naming each',
    async () => {
      const root = fixture({
        'packages/shared/outside.ts': "export const OUTSIDE = 'outside';\n",
        'packages/shared/collections.ts': 'export const collections = {};\n',
        'packages/shared/outside.css': '.outside { color: red; }\n',
        'packages/shared/plugin.mjs':
          "export default ({ addUtilities }) => addUtilities({ '.from-plugin': { color: 'red' } });\n",
        'packages/shared/src/scanned.html': '<b class="italic"></b>\n',
        'packages/shared/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>\n',
        'packages/shared/notice.txt': 'shared\n',
        'packages/website/src/pages/index.astro': page(
          "import { OUTSIDE } from '../../../shared/outside';",
          '{OUTSIDE}',
        ),
        'packages/website/src/content.config.ts':
          "export { collections } from '../../shared/collections';\n",
        'packages/website/src/styles/site.css': [
          "@import 'tailwindcss' source('../');",
          "@import '../../../shared/outside.css';",
          "@plugin '../../../shared/plugin.mjs';",
          "@source '../../../shared/src';",
          ".mark { background: url('../../../shared/mark.svg'); }",
        ].join('\n'),
      });
      mkdirSync(join(root, 'public'), { recursive: true });
      symlinkSync(join(root, '..', 'shared', 'notice.txt'), join(root, 'public', 'notice.txt'));
      const failure = buildSite(root);

      for (const escape of [
        'reads packages/shared/outside.ts',
        'reads packages/shared/collections.ts',
        'reads packages/shared/outside.css',
        'reads packages/shared/plugin.mjs',
        'scans packages/shared/src',
        'reads packages/shared/mark.svg',
        'reads packages/shared/notice.txt',
      ]) {
        await expect(failure).rejects.toThrow(escape);
      }
    },
    BUILD_TIMEOUT,
  );

  it(
    '[SITE-6] refuses a site whose PostCSS plugins live outside its config or are replaced later, or that turns CSS Modules on, however late',
    async () => {
      const root = fixture({ 'packages/website/src/pages/index.astro': '<p>Site</p>\n' });
      /** A Vite plugin that sets part of the CSS config after every integration has run. */
      const later = (css: object) => ({
        ...site.vite,
        plugins: [{ name: 'later', config: () => ({ css }) }],
      });

      await expect(
        buildSite(root, { ...site.vite, css: { modules: false, postcss: 'postcss.config.mjs' } }),
      ).rejects.toThrow('declare the site');
      await expect(
        buildSite(root, { ...site.vite, css: { ...site.vite?.css, modules: {} } }),
      ).rejects.toThrow('vite.css.modules set to false');
      await expect(buildSite(root, later({ modules: {} }))).rejects.toThrow(
        'vite.css.modules set to false',
      );
      await expect(buildSite(root, later({ postcss: '.' }))).rejects.toThrow('recorder gone');
    },
    BUILD_TIMEOUT,
  );
});
