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
  /* Two opposing arrows between two vertical bars — full-duplex push. */
  'websocket-gateway': (
    <svg {...svgProps}>
      <path d="M2.5 2.5v11M13.5 2.5v11" />
      <path d="M4.5 6h7M9.5 4l2 2-2 2" />
      <path d="M11.5 10h-7M6.5 8l-2 2 2 2" />
    </svg>
  ),
  /* Four sidecars with crossing east-west links. */
  'service-mesh': (
    <svg {...svgProps}>
      <path d="M6 6l4 4M10 6l-4 4" />
      <circle cx="4.5" cy="4.5" r="2" />
      <circle cx="11.5" cy="4.5" r="2" />
      <circle cx="4.5" cy="11.5" r="2" />
      <circle cx="11.5" cy="11.5" r="2" />
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
  /* The service's rounded rect, with a lambda where the core would be. */
  'serverless-function': (
    <svg {...svgProps}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M6.2 5l3.3 6M7.9 8.1 5.8 11" />
    </svg>
  ),
  /* Stacked work items with a clock in the corner — bulk, on a schedule. */
  'batch-job': (
    <svg {...svgProps}>
      <path d="M3 4.5h10M3 8h10M3 11.5h4.5" />
      <circle cx="11.5" cy="11.5" r="2.8" />
      <path d="M11.5 10.2v1.3l1 .7" />
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
  /* A horizontal key — the value is one lookup away. */
  'kv-store': (
    <svg {...svgProps}>
      <circle cx="4.5" cy="8" r="2.5" />
      <path d="M7 8h7M11 8v2.5M13.5 8v2" />
    </svg>
  ),
  /* L-axes with a rising zigzag — points ordered by time. */
  'time-series-db': (
    <svg {...svgProps}>
      <path d="M3 2.5v11h11" />
      <path d="M5 11l2.5-3 2 1.5L13 5" />
    </svg>
  ),
  /* Three embeddings with rays from the query point between them. */
  'vector-db': (
    <svg {...svgProps}>
      <path d="M8 9V4.8M8 9l-3.2 2.1M8 9l3.2 2.1" />
      <circle cx="8" cy="3" r="1.2" />
      <circle cx="3.5" cy="12" r="1.2" />
      <circle cx="12.5" cy="12" r="1.2" />
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
  /* One publisher fanning to three subscribers — the load-balancer's family. */
  'pub-sub': (
    <svg {...svgProps}>
      <path d="M4.7 7.2 10 3.9M4.9 8h5M4.7 8.8 10 12.1" />
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="12" cy="3.5" r="1.4" />
      <circle cx="12" cy="8" r="1.4" />
      <circle cx="12" cy="12.5" r="1.4" />
    </svg>
  ),
  /* The database motif shrunk, its commits curving out into stream dashes. */
  'cdc-connector': (
    <svg {...svgProps}>
      <ellipse cx="4.5" cy="3.5" rx="2.5" ry="1.3" />
      <path d="M2 3.5v3c0 .7 1.1 1.3 2.5 1.3S7 7.2 7 6.5v-3" />
      <path d="M8.5 5.5c3 .5 4.5 2 4.5 4.5M11.5 8.5 13 10l1.5-1.5" />
      <path d="M2.5 13h3M7 13h3M11.5 13h2" />
    </svg>
  ),
  /* A bell with its ringer. */
  'notification-service': (
    <svg {...svgProps}>
      <path d="M8 2.5a4 4 0 0 1 4 4v3l1.5 2h-11L4 9.5v-3a4 4 0 0 1 4-4z" />
      <path d="M6.8 13.5a1.3 1.3 0 0 0 2.4 0" />
    </svg>
  ),
  /* The stream's wave goes in; a settled straight line comes out. */
  'stream-processor': (
    <svg {...svgProps}>
      <path d="M1.5 6.3c1-.9 2 .9 3 0M1.5 9.7c1-.9 2 .9 3 0" />
      <rect x="6" y="4.5" width="5.5" height="7" rx="1" />
      <path d="M11.5 8h3" />
    </svg>
  ),
  /* A warehouse silhouette: pitched roof over three stored columns. */
  'data-warehouse': (
    <svg {...svgProps}>
      <path d="M2.5 6.5 8 3l5.5 3.5v7h-11z" />
      <path d="M5.5 9v4.5M8 9v4.5M10.5 9v4.5" />
    </svg>
  ),
  /* Raw water in a basin — the event-stream's waves, stilled. */
  'data-lake': (
    <svg {...svgProps}>
      <path d="M2.5 5.5c0 4 2.3 6.5 5.5 6.5s5.5-2.5 5.5-6.5" />
      <path d="M4.5 7.2c1.2-1 2.3 1 3.5 0s2.3 1 3.5 0" />
      <path d="M5.5 9.8c.9-.8 1.7.8 2.5 0s1.6.8 2.5 0" />
    </svg>
  ),
  /* Two inputs, one prediction — the smallest possible network. */
  'ml-inference': (
    <svg {...svgProps}>
      <path d="M5.6 5.2 10.4 7.3M5.6 10.8 10.4 8.7" />
      <circle cx="4" cy="4.5" r="1.7" />
      <circle cx="4" cy="11.5" r="1.7" />
      <circle cx="12" cy="8" r="1.7" />
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
