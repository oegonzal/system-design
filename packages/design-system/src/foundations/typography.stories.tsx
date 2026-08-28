import styled from '@emotion/styled';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { fontFamily, fontSize, fontWeight, lineHeight } from '../theme/tokens';

const Row = styled.div`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[5]}px;
  padding: ${({ theme }) => `${theme.space[3]}px ${theme.space[5]}px`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
`;

const Token = styled.code`
  min-width: 140px;
  color: ${({ theme }) => theme.color.text.muted};
  font-size: ${({ theme }) => theme.font.size.sm};
`;

const SAMPLE = 'Route reads to the replica; writes stay on the primary';

const meta: Meta = { title: 'Design System/Foundations/Typography' };
export default meta;

type Story = StoryObj;

export const Sizes: Story = {
  render: () => (
    <>
      {Object.entries(fontSize).map(([key, value]) => (
        <Row key={key}>
          <Token>
            font.size.{key} · {value}
          </Token>
          <span style={{ fontSize: value }}>{SAMPLE}</span>
        </Row>
      ))}
    </>
  ),
};

export const Weights: Story = {
  render: () => (
    <>
      {Object.entries(fontWeight).map(([key, value]) => (
        <Row key={key}>
          <Token>
            font.weight.{key} · {value}
          </Token>
          <span style={{ fontWeight: value }}>{SAMPLE}</span>
        </Row>
      ))}
    </>
  ),
};

export const LineHeights: Story = {
  render: () => (
    <>
      {Object.entries(lineHeight).map(([key, value]) => (
        <Row key={key}>
          <Token>
            font.lineHeight.{key} · {value}
          </Token>
          <span style={{ lineHeight: value, maxWidth: 360, display: 'inline-block' }}>
            {SAMPLE}. {SAMPLE}. {SAMPLE}.
          </span>
        </Row>
      ))}
    </>
  ),
};

export const Families: Story = {
  render: () => (
    <>
      {Object.entries(fontFamily).map(([key, value]) => (
        <Row key={key}>
          <Token>font.family.{key}</Token>
          <span style={{ fontFamily: value }}>{SAMPLE}</span>
        </Row>
      ))}
    </>
  ),
};
