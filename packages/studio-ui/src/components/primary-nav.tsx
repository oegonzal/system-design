'use client';

import styled from '@emotion/styled';
import { transient } from '@sysdesign/design-system';
import { isUnder, useConfirmLeave } from '@sysdesign/web-kit';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { NAV_ITEMS } from '../app/nav';

const Nav = styled.nav`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]}px;
`;

const NavLink = styled(Link, transient)<{ $active: boolean }>`
  padding: ${({ theme }) => `${theme.space[2]}px ${theme.space[4]}px`};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: ${({ theme }) => theme.font.size.md};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-decoration: none;
  color: ${({ theme, $active }) =>
    $active ? theme.color.text.onSelected : theme.color.text.secondary};
  background: ${({ theme, $active }) => ($active ? theme.color.bg.selected : 'transparent')};

  &:hover {
    background: ${({ theme, $active }) =>
      $active ? theme.color.bg.selected : theme.color.bg.subtle};
    color: ${({ theme, $active }) =>
      $active ? theme.color.text.onSelected : theme.color.text.primary};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.border.focus};
    outline-offset: 1px;
  }
`;

/** The app's routes. A page with unsaved work is asked before a link leaves it. */
export function PrimaryNav() {
  const pathname = usePathname();
  const confirmLeave = useConfirmLeave();

  return (
    <Nav aria-label="Primary">
      {NAV_ITEMS.map((item) => {
        const active = isUnder(pathname, item.href);
        return (
          <NavLink
            key={item.href}
            href={item.href}
            $active={active}
            aria-current={active ? 'page' : undefined}
            onNavigate={(event) => {
              if (!confirmLeave()) event.preventDefault();
            }}
          >
            {item.label}
          </NavLink>
        );
      })}
    </Nav>
  );
}
