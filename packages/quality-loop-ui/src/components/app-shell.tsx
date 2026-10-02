'use client';

import styled from '@emotion/styled';
import { Heading, SkipLink, Stack, Text } from '@sysdesign/design-system';
import { RouteAnnouncer } from '@sysdesign/web-kit';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';

import { navItemFor } from '../app/nav';
import { PrimaryNav } from './primary-nav';

const Shell = styled.div`
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.bg.app};
`;

const Header = styled.header`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[5]}px;
  flex-wrap: wrap;
  padding: ${({ theme }) => `${theme.space[4]}px ${theme.space[6]}px`};
  background: ${({ theme }) => theme.color.bg.surface};
  border-bottom: 1px solid ${({ theme }) => theme.color.border.subtle};
`;

/**
 * The frame is as wide as the widest page needs — the inspector puts an action
 * rail beside a detail pane. A page that reads as one column declares its own
 * measure with `Measure` rather than borrowing the frame's.
 */
const Main = styled.main`
  flex: 1;
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  padding: ${({ theme }) => theme.space[6]}px;
  box-sizing: border-box;
`;

const labelFor = (pathname: string) => navItemFor(pathname)?.label;

/** The frame every page sits in: the brand, the nav, `main`, and the route announcer. */
export function AppShell({ children }: { children?: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <Shell>
      <SkipLink href="#main">Skip to main content</SkipLink>
      <Header>
        <Stack direction="row" gap={4} align="baseline" wrap>
          <Heading level={1}>Quality loop</Heading>
          <Text as="span" tone="muted">
            producer → critics → evaluators → controller
          </Text>
        </Stack>
        <PrimaryNav />
      </Header>
      <Main id="main" ref={mainRef}>
        {children}
      </Main>
      <RouteAnnouncer labelFor={labelFor} />
    </Shell>
  );
}
