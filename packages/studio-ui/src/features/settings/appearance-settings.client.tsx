'use client';

import { ACCENTS, COLOR_MODES, MOTION_LEVELS } from '@sysdesign/contracts';
import { Button, Heading, Stack, Surface, Text, Toolbar } from '@sysdesign/design-system';

import { useAppearance, useAppearanceActions } from '../../providers/appearance-context';

const MODE_LABEL: Record<(typeof COLOR_MODES)[number], string> = {
  light: 'Light',
  dark: 'Dark',
};

const ACCENT_LABEL: Record<(typeof ACCENTS)[number], string> = {
  blueprint: 'Blueprint',
  teal: 'Teal',
  violet: 'Violet',
  slate: 'Slate',
};

const MOTION_LABEL: Record<(typeof MOTION_LEVELS)[number], string> = {
  full: 'Full',
  reduced: 'Reduced',
};

/**
 * Appearance controls — option buttons straight off the contract tuples, so
 * a new accent shows up here the moment it exists. Every change applies live
 * through the AppearanceProvider and persists to localStorage.
 */
export function AppearanceSettings() {
  const settings = useAppearance();
  const { setColorMode, setAccent, setMotion } = useAppearanceActions();

  return (
    <Stack gap={6}>
      <Stack gap={2}>
        <Heading level={1}>Appearance</Heading>
        <Text tone="secondary">Changes apply immediately and are remembered on this device.</Text>
      </Stack>

      <Surface padding={6}>
        <Stack gap={6}>
          <Stack gap={3}>
            <Heading level={2}>Color mode</Heading>
            <Toolbar aria-label="Color mode">
              {COLOR_MODES.map((mode) => (
                <Button
                  key={mode}
                  selected={settings.colorMode === mode}
                  onClick={() => setColorMode(mode)}
                  data-testid={`color-mode-${mode}`}
                >
                  {MODE_LABEL[mode]}
                </Button>
              ))}
            </Toolbar>
          </Stack>

          <Stack gap={3}>
            <Heading level={2}>Accent</Heading>
            <Toolbar aria-label="Accent">
              {ACCENTS.map((accent) => (
                <Button
                  key={accent}
                  selected={settings.accent === accent}
                  onClick={() => setAccent(accent)}
                  data-testid={`accent-${accent}`}
                >
                  {ACCENT_LABEL[accent]}
                </Button>
              ))}
            </Toolbar>
          </Stack>

          <Stack gap={3}>
            <Heading level={2}>Motion</Heading>
            <Toolbar aria-label="Motion">
              {MOTION_LEVELS.map((level) => (
                <Button
                  key={level}
                  selected={settings.motion === level}
                  onClick={() => setMotion(level)}
                  data-testid={`motion-${level}`}
                >
                  {MOTION_LABEL[level]}
                </Button>
              ))}
            </Toolbar>
            <Text size="sm" tone="muted">
              Reduced motion stops spinners, shimmers and canvas dash animation. The OS-level
              reduced-motion preference always wins regardless of this setting.
            </Text>
          </Stack>
        </Stack>
      </Surface>
    </Stack>
  );
}
