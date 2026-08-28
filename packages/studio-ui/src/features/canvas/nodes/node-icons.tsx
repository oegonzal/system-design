import type { NodeKind } from '@sysdesign/contracts';
import type { ReactElement, SVGProps } from 'react';

/**
 * One small geometric glyph per node kind. `satisfies Record<NodeKind, …>`
 * keeps this table honest: a kind added to the contract fails compilation
 * here until it has an icon.
 *
 * All glyphs stroke with `currentColor`, so the chip that renders them picks
 * the color (the kind's paired foreground) and the icons stay legible on any
 * chip background.
 */

const svgProps: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 16 16',
  width: 14,
  height: 14,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const NODE_ICONS = {
  client: (
    <svg {...svgProps}>
      <rect x="2" y="3" width="12" height="8" rx="1" />
      <path d="M6 13.5h4M8 11v2.5" />
    </svg>
  ),
  cdn: (
    <svg {...svgProps}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c-2.2 1.8-2.2 10.2 0 12M8 2c2.2 1.8 2.2 10.2 0 12" />
    </svg>
  ),
  dns: (
    <svg {...svgProps}>
      <circle cx="8" cy="8" r="6" />
      <path d="M5 10V6l3 4V6M11 6v4" />
    </svg>
  ),
  gateway: (
    <svg {...svgProps}>
      <path d="M3 13V7a5 5 0 0 1 10 0v6" />
      <path d="M3 13h10M8 13v-3" />
    </svg>
  ),
  'load-balancer': (
    <svg {...svgProps}>
      <circle cx="8" cy="3.5" r="1.7" />
      <path d="M8 5.2v2.3M8 7.5 3.5 11M8 7.5V12M8 7.5l4.5 3.5" />
    </svg>
  ),
  service: (
    <svg {...svgProps}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <circle cx="8" cy="8" r="2.2" />
    </svg>
  ),
  worker: (
    <svg {...svgProps}>
      <rect x="2.5" y="4" width="11" height="8" rx="1.5" />
      <path d="M5.5 8h2M8.5 10.5 11 8 8.5 5.5" />
    </svg>
  ),
  database: (
    <svg {...svgProps}>
      <ellipse cx="8" cy="4" rx="5.5" ry="2.2" />
      <path d="M2.5 4v8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2V4" />
    </svg>
  ),
  replica: (
    <svg {...svgProps}>
      <ellipse cx="8" cy="4.5" rx="4.5" ry="1.8" />
      <path d="M3.5 4.5V8c0 1 2 1.8 4.5 1.8S12.5 9 12.5 8V4.5" />
      <path d="M3.5 8v3.5c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8V8" />
    </svg>
  ),
  cache: (
    <svg {...svgProps}>
      <path d="M9.5 1.5 4 9h3.5L6.5 14.5 12 7H8.5z" />
    </svg>
  ),
  queue: (
    <svg {...svgProps}>
      <path d="M2.5 4.5h11M2.5 8h8M2.5 11.5h5" />
      <path d="M12 9.5 14 11.5 12 13.5" />
    </svg>
  ),
  'event-stream': (
    <svg {...svgProps}>
      <path d="M2 5c2-2 4 2 6 0s4 2 6 0M2 9c2-2 4 2 6 0s4 2 6 0M2 13c2-2 4 2 6 0s4 2 6 0" />
    </svg>
  ),
  'object-store': (
    <svg {...svgProps}>
      <path d="M2.5 5.5 8 2.5l5.5 3v5L8 13.5l-5.5-3z" />
      <path d="M2.5 5.5 8 8.5l5.5-3M8 8.5v5" />
    </svg>
  ),
  'search-index': (
    <svg {...svgProps}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3.5 3.5" />
    </svg>
  ),
  scheduler: (
    <svg {...svgProps}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.5V8l2.5 1.5" />
    </svg>
  ),
  'external-api': (
    <svg {...svgProps}>
      <rect x="2.5" y="2.5" width="7" height="11" rx="1.5" />
      <path d="M9.5 8h4M11.5 6l2 2-2 2" />
    </svg>
  ),
} as const satisfies Record<NodeKind, ReactElement>;
