import { ThemeRoot } from '@sysdesign/design-system';
import {
  ACCENTS,
  COLOR_MODES,
  DEFAULT_APPEARANCE_SETTINGS,
  MOTION_LEVELS,
  type AppearanceSettings,
} from '@sysdesign/contracts';
import type { Preview } from '@storybook/react-vite';

/**
 * Every story renders inside the same provider as the running app, via the
 * one shared `ThemeRoot` — no second copy of the ThemeProvider/Global wiring
 * here.
 *
 * The toolbar drives the same appearance settings the app stores, so the
 * catalog exercises dark mode, every accent and both motion levels without a
 * single story knowing they exist. Option lists come straight from the
 * contract, so a new accent appears in the toolbar with no edit here.
 */
const preview: Preview = {
  // Project-level rather than per-meta, so a new component is documented by
  // existing rather than by remembering to opt in.
  tags: ['autodocs'],

  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    options: {
      storySort: {
        order: ['Design System', ['Foundations', 'Primitives', 'Charts'], 'Studio'],
      },
    },
  },

  globalTypes: {
    colorMode: {
      description: 'Colour mode',
      toolbar: { title: 'Mode', icon: 'contrast', items: [...COLOR_MODES], dynamicTitle: true },
    },
    accent: {
      description: 'Accent',
      toolbar: { title: 'Accent', icon: 'paintbrush', items: [...ACCENTS], dynamicTitle: true },
    },
    motion: {
      description: 'Motion level',
      toolbar: { title: 'Motion', icon: 'play', items: [...MOTION_LEVELS], dynamicTitle: true },
    },
  },

  initialGlobals: {
    colorMode: DEFAULT_APPEARANCE_SETTINGS.colorMode,
    accent: DEFAULT_APPEARANCE_SETTINGS.accent,
    motion: DEFAULT_APPEARANCE_SETTINGS.motion,
  },

  decorators: [
    (Story, context) => {
      // Mapped field by field, never spread: `globals` is Record<string, any>,
      // so spreading would let an unrelated addon key silently reach
      // createTheme as a settings property.
      const settings: Partial<AppearanceSettings> = {
        colorMode: context.globals['colorMode'] as AppearanceSettings['colorMode'],
        accent: context.globals['accent'] as AppearanceSettings['accent'],
        motion: context.globals['motion'] as AppearanceSettings['motion'],
      };

      return (
        <ThemeRoot settings={settings}>
          <Story />
        </ThemeRoot>
      );
    },
  ],
};

export default preview;
