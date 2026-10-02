import { Link } from '@sysdesign/design-system';
import NextLink from 'next/link';

/**
 * The design system's anchor, routed by Next. The one place the app binds the
 * two; every component reaches it through `LinkProvider`, so pure components
 * and their stories never import Next.
 */
export const RouteLink = Link.withComponent(NextLink);
