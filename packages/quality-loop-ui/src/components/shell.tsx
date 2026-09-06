'use client';

import styled from '@emotion/styled';
import { Heading, SkipLink, Text } from '@sysdesign/design-system';
import type { ReactNode } from 'react';

const Root = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.bg.app};
`;

const Header = styled.header`
  display: flex;
  align-items: baseline;
  gap: ${({ theme }) => theme.space[4]}px;
  padding: ${({ theme }) => `${theme.space[4]}px ${theme.space[6]}px`};
  background: ${({ theme }) => theme.color.bg.surface};
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
`;

const Main = styled.main`
  flex: 1;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space[6]}px;
  box-sizing: border-box;
`;

/** One page, one column: the header names the tool, `main` holds the workspace. */
export function Shell({ children }: { children?: ReactNode }) {
  return (
    <Root>
      <SkipLink href="#main">Skip to main content</SkipLink>
      <Header>
        <Heading level={1}>Quality loop</Heading>
        <Text as="span" tone="muted">
          producer → critics → evaluators → controller
        </Text>
      </Header>
      <Main id="main">{children}</Main>
    </Root>
  );
}
