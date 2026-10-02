'use client';

import styled from '@emotion/styled';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS, navItemFor } from '../app/nav';
import { useLink } from './link-context';

const Nav = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]}px;
  flex-wrap: wrap;
`;

/** The nav bar over `NAV_ITEMS`; the current route is the one the pathname is under. */
export function PrimaryNav() {
  const pathname = usePathname();
  const Link = useLink();
  const current = navItemFor(pathname);
  return (
    <Nav aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const active = current?.href === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            $variant="nav"
            $active={active}
            aria-current={active ? 'page' : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </Nav>
  );
}
