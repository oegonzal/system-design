'use client';

import styled from '@emotion/styled';
import { Panel } from '@xyflow/react';

const Rows = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[4]}px;
  align-items: center;
  padding: ${({ theme }) => `${theme.space[1]}px ${theme.space[3]}px`};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border.subtle};
  color: ${({ theme }) => theme.color.text.muted};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-family: ${({ theme }) => theme.font.family.base};
`;

const Row = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

const Swatch = styled.svg`
  width: 44px;
  height: 10px;
  stroke: currentColor;
  fill: none;
  stroke-width: 1.5;
`;

const Number = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6em;
  padding: 0 ${({ theme }) => theme.space[2]}px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.accent.default};
  color: ${({ theme }) => theme.color.accent.fg};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

/**
 * What the lines mean, in the band every fit keeps clear: a sync call is a
 * request and its reply, drawn with an arrowhead at each end; an async hop
 * is one message one way, dashed; a numbered pill is a hop of the path shown
 * from the Brief tab. A Panel sits outside the viewport, so the legend is
 * never in a copy of the diagram.
 */
export function CanvasLegend() {
  return (
    <Panel position="bottom-center" data-testid="canvas-legend">
      <Rows>
        <Row>
          <Swatch viewBox="0 0 44 10" aria-hidden="true">
            <path d="M6 5h32" />
            <path d="M10 1 6 5l4 4" />
            <path d="M34 1l4 4-4 4" />
          </Swatch>
          sync — request and reply
        </Row>
        <Row>
          <Swatch viewBox="0 0 44 10" aria-hidden="true">
            <path d="M2 5h36" strokeDasharray="5 3" />
            <path d="M34 1l4 4-4 4" />
          </Swatch>
          async — one message, one way
        </Row>
        <Row>
          <Number>1</Number>
          hop of the path shown from the Brief tab
        </Row>
      </Rows>
    </Panel>
  );
}
