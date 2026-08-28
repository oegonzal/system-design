import { useTheme } from '@emotion/react';
import styled from '@emotion/styled';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { transient } from '../theme/styled';

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]}px;
  padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[5]}px`};
`;

const Token = styled.code`
  min-width: 160px;
  color: ${({ theme }) => theme.color.text.muted};
  font-size: ${({ theme }) => theme.font.size.sm};
`;

const Bar = styled('div', transient)<{ $size: string }>`
  height: 16px;
  width: ${({ $size }) => $size};
  background: ${({ theme }) => theme.color.accent.default};
  border-radius: ${({ theme }) => theme.radius.sm};
`;

const Box = styled('div', transient)<{ $radius: string }>`
  width: 72px;
  height: 48px;
  background: ${({ theme }) => theme.color.bg.selected};
  border: 1px solid ${({ theme }) => theme.color.border.accent};
  border-radius: ${({ $radius }) => $radius};
`;

const meta: Meta = {
  title: 'Design System/Foundations/Spacing',
  parameters: {
    docs: {
      description: {
        component:
          'One nine-step tuple on a 4px grid. Components take *indices*, not pixel values, so `theme.space[9]` is a compile error rather than an `undefined` in a CSS declaration.',
      },
    },
  },
};
export default meta;

type Story = StoryObj;

export const Scale: Story = {
  render: function ScaleStory() {
    const theme = useTheme();

    return (
      <>
        {theme.space.map((value, index) => (
          <Row key={`space-${String(index)}`}>
            <Token>
              space[{index}] · {value}px
            </Token>
            <Bar $size={`${Math.max(value, 1)}px`} />
          </Row>
        ))}
      </>
    );
  },
};

export const Radii: Story = {
  render: function RadiiStory() {
    const theme = useTheme();

    return (
      <>
        {Object.entries(theme.radius).map(([key, value]) => (
          <Row key={key}>
            <Token>
              radius.{key} · {value}
            </Token>
            <Box $radius={value} />
          </Row>
        ))}
      </>
    );
  },
};

export const Shadows: Story = {
  render: function ShadowsStory() {
    const theme = useTheme();

    return (
      <Row style={{ gap: 32, padding: 32 }}>
        {Object.entries(theme.shadow).map(([key, value]) => (
          <div key={key}>
            <Token>shadow.{key}</Token>
            <div
              style={{
                width: 120,
                height: 80,
                marginTop: 8,
                borderRadius: theme.radius.lg,
                background: theme.color.bg.surface,
                boxShadow: value,
              }}
            />
          </div>
        ))}
      </Row>
    );
  },
};
