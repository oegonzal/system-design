/**
 * Renders every entry in the Storybook catalog and fails the build if any of
 * them crashes, comes up blank, renders outside the theme, logs to the
 * console, or trips axe.
 *
 * The pipeline's `build-storybook` step proves each story still *compiles*
 * against its component. It has never proved one *renders*. That gap hides a
 * whole class of defect a bundler cannot see — a style-only prop reaching the
 * DOM, a missing list key, a contrast regression in one colour mode, a story
 * mounted outside `ThemeRoot` — and a token-driven design system is exposed to
 * all of them.
 *
 *     pnpm test:stories                                      # starts its own server
 *     STORYBOOK_URL=http://localhost:6006 pnpm test:stories  # against one already running
 *
 * Deliberately the dev server and not `storybook-static`. A production React
 * bundle has its development warnings compiled out, so the built catalog cannot
 * emit "unique key" or "React does not recognize this prop" at all.
 * `build-storybook` already runs in CI and covers the production bundle
 * compiling; this covers what it renders and says.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join } from 'node:path';

import { chromium, type Browser, type Page } from '@playwright/test';

import {
  planRenders,
  summarise,
  type CatalogEntry,
  type RenderResult,
  type RenderTarget,
} from './policy';

/**
 * Only what this file calls, declared structurally rather than pulled from
 * axe-core's own types: the gate depends on four fields, not on their type
 * package staying shaped the way it is today.
 */
interface AxeRun {
  violations: {
    id: string;
    impact?: string | null;
    help: string;
    nodes: { target?: string[]; failureSummary?: string }[];
  }[];
}

declare global {
  interface Window {
    axe: { run(context: string, options: { resultTypes: string[] }): Promise<AxeRun> };
  }
}

const ROOT = join(__dirname, '..', '..');
/** Where the catalog host lives; absent until that package lands. */
const STORYBOOK_DIR = join(ROOT, 'packages', 'storybook', '.storybook');
/** The port `nx run storybook:storybook` already uses. */
const PORT = 6006;
const OWN_URL = `http://localhost:${PORT}`;

/** From `axe-core` directly, not from whatever `addon-a11y` happens to bundle. */
const AXE_PATH = join(dirname(require.resolve('axe-core')), 'axe.min.js');

/** Two below the core count, clamped to [2, 4]: CI runners are small. */
const WORKERS = Math.max(2, Math.min(4, cpus().length - 2));

const READY_TIMEOUT_MS = 300_000;
const RENDER_TIMEOUT_MS = 45_000;

async function reachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/index.json`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await reachable(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Storybook did not answer at ${url}/index.json within ${timeoutMs}ms`);
}

/**
 * `--ci` keeps it from opening a browser tab; the Nx target omits it so that a
 * developer running the same target still gets one.
 *
 * Detached, so the whole group can be signalled on the way out: Nx spawns the
 * Storybook CLI as a child, and killing only the parent orphans it holding the
 * port.
 */
function startServer(): ChildProcess {
  return spawn('pnpm', ['exec', 'nx', 'run', 'storybook:storybook', '--', '--ci'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
}

function stopServer(server: ChildProcess | undefined): void {
  if (server?.pid === undefined) return;
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
}

async function renderOne(
  page: Page,
  baseUrl: string,
  target: RenderTarget,
  noise: RenderResult['noise'],
): Promise<RenderResult> {
  const result: RenderResult = { ...target, noise: [], violations: [] };
  noise.length = 0;

  // `globals=colorMode:<mode>` drives the same ThemeRoot toolbar global a
  // person would flip; ThemeRoot answers by stamping `data-color-mode` on the
  // preview's <html>, which the mount snapshot reads back as proof the mode
  // actually applied.
  const url =
    `${baseUrl}/iframe.html?id=${encodeURIComponent(target.id)}` +
    `&viewMode=${target.kind}&globals=colorMode:${target.mode}`;

  try {
    await page.goto(url, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
    await page.waitForFunction(
      (kind) => {
        const { classList } = document.body;
        if (classList.contains('sb-show-errordisplay')) return true;
        if (classList.contains('sb-show-nopreview')) return true;
        const root = document.getElementById(kind === 'docs' ? 'storybook-docs' : 'storybook-root');
        return root !== null && root.children.length > 0;
      },
      target.kind,
      { timeout: RENDER_TIMEOUT_MS },
    );
    /* A docs page mounts its heading before the story blocks beneath it. */
    await page.waitForTimeout(target.kind === 'docs' ? 600 : 120);

    result.mount = await page.evaluate((kind) => {
      const root = document.getElementById(kind === 'docs' ? 'storybook-docs' : 'storybook-root');
      const box = root?.getBoundingClientRect();
      const error = document.querySelector('#error-message');
      return {
        errorDisplay: document.body.classList.contains('sb-show-errordisplay'),
        noPreview: document.body.classList.contains('sb-show-nopreview'),
        children: root?.children.length ?? 0,
        height: box ? Math.round(box.height) : 0,
        errorText: error?.textContent?.slice(0, 300) ?? null,
        colorModeAttr: document.documentElement.getAttribute('data-color-mode'),
      };
    }, target.kind);

    /*
     * Stories only. A docs page is mostly Storybook's own chrome, and holding
     * this repo's build red for an addon's markup would make the gate something
     * to disable rather than something to fix.
     */
    if (target.kind === 'story') {
      await page.addScriptTag({ path: AXE_PATH });
      result.violations = await page.evaluate(async () => {
        /*
         * addon-a11y runs axe inside the preview itself, so a second concurrent
         * run throws rather than queueing. Wait it out instead of racing it.
         */
        for (let attempt = 0; ; attempt++) {
          try {
            const run = await window.axe.run('#storybook-root', { resultTypes: ['violations'] });
            return run.violations.map((violation) => ({
              id: violation.id,
              impact: violation.impact ?? null,
              help: violation.help,
              count: violation.nodes.length,
              target: violation.nodes[0]?.target?.join(' ') ?? '',
              sample: (violation.nodes[0]?.failureSummary ?? '')
                .split('\n')
                .slice(0, 3)
                .join(' | '),
            }));
          } catch (error) {
            if (attempt >= 20 || !/already running/i.test(String(error))) throw error;
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
        }
      });
    }
  } catch (error) {
    result.fatal = String(error).split('\n')[0]!.slice(0, 300);
  }

  result.noise = [...noise];
  return result;
}

async function renderSlice(
  browser: Browser,
  baseUrl: string,
  targets: readonly RenderTarget[],
): Promise<RenderResult[]> {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    /*
     * Entrance animations would otherwise be captured mid-flight and make
     * height assertions flaky. Motion behaviour is the design system's own
     * unit-test concern, not this gate's.
     */
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  const noise: RenderResult['noise'] = [];
  page.on('console', (message) => {
    const kind = message.type();
    if (kind === 'error' || kind === 'warning')
      noise.push({ kind, text: message.text().slice(0, 500) });
  });
  page.on('pageerror', (error) =>
    noise.push({ kind: 'pageerror', text: String(error).slice(0, 500) }),
  );

  const results: RenderResult[] = [];
  for (const target of targets) {
    results.push(await renderOne(page, baseUrl, target, noise));
    process.stdout.write('.');
  }

  await context.close();
  return results;
}

async function main(): Promise<void> {
  // Fail with the real reason, not a connection timeout: the catalog host may
  // simply not exist yet, and five minutes of polling to say so helps nobody.
  if (!existsSync(STORYBOOK_DIR)) {
    throw new Error(
      `packages/storybook/.storybook does not exist — there is no Storybook to smoke-test. ` +
        `Add the catalog host package first, or drop test:stories from the pipeline that called this.`,
    );
  }

  const provided = process.env['STORYBOOK_URL'];
  const baseUrl = provided ?? OWN_URL;
  let server: ChildProcess | undefined;

  /*
   * Reuse a server a developer already has open — but never on CI, where reuse
   * would mean testing whatever a previous job left behind.
   */
  const reusable = provided !== undefined || (!process.env['CI'] && (await reachable(baseUrl)));

  if (reusable) {
    console.log(`using the Storybook already answering at ${baseUrl}`);
  } else {
    console.log(`starting Storybook on ${OWN_URL}`);
    server = startServer();
  }

  const browser = await chromium.launch();

  try {
    await waitForServer(baseUrl, reusable ? 15_000 : READY_TIMEOUT_MS);

    const index = (await (await fetch(`${baseUrl}/index.json`)).json()) as {
      entries: Record<string, CatalogEntry>;
    };
    const targets = planRenders(Object.values(index.entries));
    console.log(`${targets.length} renders across ${WORKERS} workers\n`);

    const slices = await Promise.all(
      Array.from({ length: WORKERS }, (_, worker) =>
        renderSlice(
          browser,
          baseUrl,
          targets.filter((_, position) => position % WORKERS === worker),
        ),
      ),
    );

    const { lines, failures } = summarise(slices.flat());
    console.log(`\n\n${lines.join('\n')}`);
    process.exitCode = failures === 0 ? 0 : 1;
  } finally {
    await browser.close();
    stopServer(server);
  }
}

void main().catch((error: unknown) => {
  console.error(String(error));
  process.exitCode = 1;
});
