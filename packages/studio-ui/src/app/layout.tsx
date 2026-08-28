import { ACCENTS, COLOR_MODES, DEFAULT_APPEARANCE_SETTINGS } from '@sysdesign/contracts';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'System Design Studio',
    template: '%s · System Design Studio',
  },
  description:
    'Practice distributed-systems design on an interactive canvas, graded by a critic/eval pipeline.',
};

/**
 * Pre-paint appearance boot script. Inline and synchronous on purpose: it
 * runs during HTML parsing, before first paint, so a dark-mode user never
 * sees a light flash while React hydrates. It only stamps the same
 * `data-color-mode` / `data-accent` attributes ThemeRoot maintains after
 * hydration; the valid vocabularies are interpolated from the contract
 * tuples so the script can never accept a value the theme cannot render.
 */
const APPEARANCE_INIT_SCRIPT = `(function () {
  var mode = ${JSON.stringify(DEFAULT_APPEARANCE_SETTINGS.colorMode)};
  var accent = ${JSON.stringify(DEFAULT_APPEARANCE_SETTINGS.accent)};
  try {
    var parsed = JSON.parse(window.localStorage.getItem('sds.appearance'));
    if (parsed && ${JSON.stringify([...COLOR_MODES])}.indexOf(parsed.colorMode) !== -1) mode = parsed.colorMode;
    if (parsed && ${JSON.stringify([...ACCENTS])}.indexOf(parsed.accent) !== -1) accent = parsed.accent;
  } catch (error) { /* defaults stand */ }
  document.documentElement.dataset.colorMode = mode;
  document.documentElement.dataset.accent = accent;
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        {/* eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml -- static, build-time string; see the doc comment above */}
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
