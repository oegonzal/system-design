import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import {
  ACCENTS,
  COLOR_MODES,
  DEFAULT_APPEARANCE_SETTINGS,
  NODE_KIND_CATEGORIES,
  SEVERITIES,
  kindsInCategory,
} from '@sysdesign/contracts';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { WCAG_AA_TEXT, contrastRatio, formatRatio } from '../theme/contrast';
import { CATEGORY_COLORS } from '../theme/semantic';
import { transient } from '../theme/styled';
import { createTheme } from '../theme/theme';
import { palette } from '../theme/tokens';

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: ${({ theme }) => theme.space[4]}px;
  padding: ${({ theme }) => theme.space[5]}px;
`;

const GroupTitle = styled.h3`
  margin: ${({ theme }) => `${theme.space[6]}px ${theme.space[5]}px 0`};
  font-size: ${({ theme }) => theme.font.size.lg};
`;

const Swatch = styled.div`
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  border-radius: ${({ theme }) => theme.radius.md};
  overflow: hidden;
`;

const Chip = styled('div', transient)<{ $value: string }>`
  height: 56px;
  background: ${({ $value }) => $value};
`;

const Caption = styled.div`
  padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[3]}px`};
  font-size: ${({ theme }) => theme.font.size.sm};

  code {
    color: ${({ theme }) => theme.color.text.muted};
  }
`;

const Ratio = styled('span', transient)<{ $passing: boolean }>`
  display: block;
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme, $passing }) => ($passing ? theme.color.text.muted : theme.color.danger.fg)};
`;

/**
 * Ratios are computed and printed rather than asserted by eye. `contrast.ts`
 * powers both this catalog and `contrast.spec.ts`, so what the story shows is
 * what CI checks.
 */
function Group({
  name,
  entries,
  against,
}: {
  name: string;
  entries: Record<string, string>;
  against?: string;
}) {
  return (
    <>
      <GroupTitle>{name}</GroupTitle>
      <Grid>
        {Object.entries(entries).map(([key, value]) => {
          const ratio = against && value !== 'transparent' ? contrastRatio(value, against) : null;

          return (
            <Swatch key={key}>
              <Chip $value={value} />
              <Caption>
                <div>{key}</div>
                <code>{value}</code>
                {ratio !== null && (
                  <Ratio $passing={ratio >= WCAG_AA_TEXT}>{formatRatio(ratio)} on surface</Ratio>
                )}
              </Caption>
            </Swatch>
          );
        })}
      </Grid>
    </>
  );
}

/** A chip rendered exactly as the canvas renders it: its own bg and fg pair. */
const KindChip = styled('div', transient)<{ $bg: string; $fg: string }>`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]}px;
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[4]}px`};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  font-size: ${({ theme }) => theme.font.size.sm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};

  code {
    font-size: ${({ theme }) => theme.font.size.xs};
    font-weight: ${({ theme }) => theme.font.weight.regular};
  }
`;

const PairChip = styled('div', transient)<{ $bg: string; $fg: string }>`
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[4]}px`};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  font-size: ${({ theme }) => theme.font.size.sm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

const meta: Meta = {
  title: 'Design System/Foundations/Colors',
  parameters: {
    docs: {
      description: {
        component:
          'Components read the **semantic** roles only. Primitives exist so a second theme is a change to one file rather than to every component — which is exactly what the accent and colour-mode settings are.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

/**
 * The only colour layer components are allowed to read. Reflects whatever the
 * toolbar's mode and accent are set to.
 */
export const SemanticRoles: Story = {
  render: function SemanticRolesStory() {
    const theme = useTheme();

    return (
      <>
        <Group name="bg" entries={theme.color.bg} />
        <Group name="text" entries={theme.color.text} against={theme.color.bg.surface} />
        <Group name="border" entries={theme.color.border} />
        <Group name="accent" entries={theme.color.accent} />
      </>
    );
  },
};

/** Raw ramps. Named for what they are, never referenced from a component. */
export const Primitives: Story = {
  render: () => (
    <>
      <Group name="neutral (light mode)" entries={palette.neutral} />
      <Group name="ink (dark mode)" entries={palette.ink} />
    </>
  ),
};

/**
 * Every accent in every mode, so the four-by-two table the contrast spec
 * enumerates is also something a human can look at.
 */
export const AccentMatrix: Story = {
  render: () => (
    <>
      {COLOR_MODES.map((colorMode) =>
        ACCENTS.map((accent) => {
          const { color } = createTheme({ ...DEFAULT_APPEARANCE_SETTINGS, colorMode, accent });

          return (
            <Group
              key={`${colorMode}-${accent}`}
              name={`${accent} · ${colorMode}`}
              entries={{
                'accent.default': color.accent.default,
                'accent.hover': color.accent.hover,
                'accent.fg': color.accent.fg,
                'bg.selected': color.bg.selected,
                'text.onSelected': color.text.onSelected,
                'border.focus': color.border.focus,
              }}
            />
          );
        }),
      )}
    </>
  ),
};

/**
 * Every node kind, shelved under its contract category and wearing that
 * category's colour — mode-independent, so this grid is identical in dark
 * mode. Colour answers "what architectural role is this?" (per-kind identity
 * is the icon's job): light blue at the client edge, deep blue for traffic,
 * indigo for compute, green for data at rest, warm ambers for the hot path,
 * gray for actors the design doesn't own. Categories with no kinds yet render
 * nothing here; `NodeCategories` below shows the full colour table.
 */
export const NodeKinds: Story = {
  render: function NodeKindsStory() {
    const theme = useTheme();

    return (
      <>
        {NODE_KIND_CATEGORIES.map((category) => {
          const kinds = kindsInCategory(category.id);
          if (kinds.length === 0) return null;

          return (
            <div key={category.id}>
              <GroupTitle>{category.label}</GroupTitle>
              <Grid>
                {kinds.map((kind) => (
                  <KindChip
                    key={kind}
                    $bg={theme.color.nodeKind[kind]}
                    $fg={theme.color.nodeKindFg[kind]}
                  >
                    {kind}
                    <code>
                      {theme.color.nodeKind[kind]} ·{' '}
                      {formatRatio(
                        contrastRatio(theme.color.nodeKindFg[kind], theme.color.nodeKind[kind]),
                      )}
                    </code>
                  </KindChip>
                ))}
              </Grid>
            </div>
          );
        })}
      </>
    );
  },
};

/**
 * The eleven category anchors behind `nodeKind` — including the categories
 * that hold no kinds yet, which `NodeKinds` above cannot show. Each pair
 * prints its computed ratio, same as every other swatch in this catalog.
 */
export const NodeCategories: Story = {
  render: function NodeCategoriesStory() {
    const theme = useTheme();

    return (
      <Grid>
        {NODE_KIND_CATEGORIES.map((category) => {
          const bg = theme.color.nodeKindCategory[category.id];
          const { fg } = CATEGORY_COLORS[category.id];

          return (
            <KindChip key={category.id} $bg={bg} $fg={fg}>
              {category.label}
              <code>
                {bg} · {formatRatio(contrastRatio(fg, bg))}
              </code>
            </KindChip>
          );
        })}
      </Grid>
    );
  },
};

/** The five severity pairs, in urgency order, plus the standalone intents. */
export const SeveritiesAndIntents: Story = {
  render: function SeveritiesAndIntentsStory() {
    const theme = useTheme();

    return (
      <>
        <GroupTitle>severity</GroupTitle>
        <Grid>
          {SEVERITIES.map((severity) => {
            const pair = theme.color.severity[severity];
            return (
              <PairChip key={severity} $bg={pair.bg} $fg={pair.fg}>
                {severity} · {formatRatio(contrastRatio(pair.fg, pair.bg))}
              </PairChip>
            );
          })}
        </Grid>
        <GroupTitle>intents</GroupTitle>
        <Grid>
          {(['danger', 'success', 'warn', 'info'] as const).map((intent) => {
            const pair = theme.color[intent];
            return (
              <PairChip key={intent} $bg={pair.bg} $fg={pair.fg}>
                {intent} · {formatRatio(contrastRatio(pair.fg, pair.bg))}
              </PairChip>
            );
          })}
        </Grid>
      </>
    );
  },
};
