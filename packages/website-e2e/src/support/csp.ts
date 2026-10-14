import type { Page } from '@playwright/test';

declare global {
  interface Window {
    cspViolations: string[];
  }
}

/** The SVG elements that animate an attribute, so can set a link's target to a URL. */
const ANIMATIONS = ['animate', 'set', 'animateMotion', 'animateTransform'];

/**
 * The attributes that hold a URL the browser follows or loads, with the
 * elements each is read on (every element when none are named) and what
 * separates the URLs it lists, when it lists several: a link's target
 * (`xlink:href` is SVG's older `href`), a form's submission, a frame's, an
 * image's or a script's source, an object's document, and the values an SVG
 * animation can set one of these to, `values` listing several. Other
 * attributes are not read.
 */
const URL_ATTRIBUTES: readonly {
  readonly name: string;
  readonly on?: readonly string[];
  readonly separator?: string;
}[] = [
  { name: 'href' },
  { name: 'xlink:href' },
  { name: 'src' },
  { name: 'action' },
  { name: 'formaction' },
  { name: 'data' },
  { name: 'to', on: ANIMATIONS },
  { name: 'from', on: ANIMATIONS },
  { name: 'by', on: ANIMATIONS },
  { name: 'values', on: ANIMATIONS, separator: ';' },
];

/**
 * Records every Content-Security-Policy violation from the first byte, in the
 * page and in every frame it attaches, each as `<disposition> <directive>
 * <blocked URI>`: `enforce` when the policy refused it, `report` when a
 * report-only policy merely noted it. Call it before navigating: the browser
 * injects init scripts itself, so the policy under test does not govern this one.
 */
export async function recordCspViolations(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.cspViolations.push(
        `${event.disposition} ${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
}

/**
 * The violations recorded so far in the page and its frames, once the browser
 * has compiled every inline event handler there — which it otherwise does only
 * when the event fires — so the policy judges each one. Chromium compiles the
 * handlers it is asked to list, so the page's listeners are listed through the
 * DevTools protocol: every node's, through every shadow root and frame, and
 * every frame's window's. Violation events arrive a task later. A `javascript:`
 * URL in an attribute that holds a URL is inline script the policy refuses the
 * moment it is followed, so each is reported as well; that walk reads the
 * document and its open shadow roots, in every frame.
 */
export async function cspViolations(page: Page): Promise<string[]> {
  const cdp = await page.context().newCDPSession(page);
  const windows: number[] = [];
  cdp.on('Runtime.executionContextCreated', ({ context }) => {
    if ((context.auxData as { type?: string } | undefined)?.type === 'default') {
      windows.push(context.id);
    }
  });
  // Enabling the runtime announces every context that already exists.
  await cdp.send('Runtime.enable');
  const { result: pageDocument } = await cdp.send('Runtime.evaluate', { expression: 'document' });
  await cdp.send('DOMDebugger.getEventListeners', {
    objectId: pageDocument.objectId ?? '',
    depth: -1,
    pierce: true,
  });
  for (const contextId of windows) {
    const { result: frameWindow } = await cdp.send('Runtime.evaluate', {
      expression: 'window',
      contextId,
    });
    await cdp.send('DOMDebugger.getEventListeners', { objectId: frameWindow.objectId ?? '' });
  }
  await cdp.detach();
  const frames = await Promise.all(
    page.frames().map((frame) =>
      frame.evaluate(async (urlAttributes) => {
        const scriptUrls: string[] = [];
        const read = (root: Document | ShadowRoot): void => {
          for (const element of root.querySelectorAll('*')) {
            for (const { name, value } of element.attributes) {
              const declared = urlAttributes.find(
                (attribute) =>
                  attribute.name === name &&
                  (attribute.on === undefined || attribute.on.includes(element.localName)),
              );
              if (declared === undefined) continue;
              const urls =
                declared.separator === undefined ? [value] : value.split(declared.separator);
              if (
                urls.some(
                  (url) =>
                    URL.canParse(url, document.baseURI) &&
                    new URL(url, document.baseURI).protocol === 'javascript:',
                )
              ) {
                scriptUrls.push(`javascript: URL <${element.localName} ${name}>`);
              }
            }
            if (element.shadowRoot !== null) read(element.shadowRoot);
          }
        };
        read(document);
        await new Promise((resolve) => setTimeout(resolve, 50));
        return [...window.cspViolations, ...scriptUrls];
      }, URL_ATTRIBUTES),
    ),
  );
  return frames.flat();
}

/** CSP3's fallback order: the directive that governs an inline attribute of each kind is the first present. */
const ATTRIBUTE_DIRECTIVES = {
  script: ['script-src-attr', 'script-src', 'default-src'],
  style: ['style-src-attr', 'style-src', 'default-src'],
} as const;

/** The only sources that can let an inline attribute through under CSP3. */
const ATTRIBUTE_SOURCES = new Set(["'unsafe-inline'", "'unsafe-hashes'"]);

/**
 * Whatever in a policy would let an inline script or style attribute through:
 * a kind no directive governs, or a source in its governing directive that can
 * allow one. Empty when the policy refuses both kinds. A directive given twice
 * counts by its first copy, as CSP3 has the browser read it.
 */
export function inlineAttributeAllowances(policy: string): string[] {
  const directives = new Map<string, string[]>();
  for (const [name = '', ...sources] of policy
    .split(';')
    .map((directive) => directive.trim().split(/\s+/))) {
    const key = name.toLowerCase();
    if (key !== '' && !directives.has(key)) {
      directives.set(
        key,
        sources.map((source) => source.toLowerCase()),
      );
    }
  }
  return Object.entries(ATTRIBUTE_DIRECTIVES).flatMap(([kind, fallbacks]) => {
    const governing = fallbacks.find((name) => directives.has(name));
    if (governing === undefined) return [`${kind} attributes: no directive governs them`];
    return (directives.get(governing) ?? [])
      .filter((source) => ATTRIBUTE_SOURCES.has(source))
      .map((source) => `${kind} attributes: ${governing} allows ${source}`);
  });
}
