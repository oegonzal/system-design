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
  /* A person: head over shoulders. */
  actor: (
    <svg {...svgProps}>
      <circle cx="8" cy="5" r="2.5" />
      <path d="M3 14c0-2.8 2.2-5 5-5s5 2.2 5 5" />
    </svg>
  ),
  /* A module: a box with its one declared interface on the right face. */
  module: (
    <svg {...svgProps}>
      <rect x="2" y="3" width="10" height="10" rx="1.5" />
      <path d="M12 6h2M12 10h2" />
      <path d="M5 6.5h4M5 9.5h3" />
    </svg>
  ),
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
  /* A browser window with a page laid out in it. */
  'static-site-host': (
    <svg {...svgProps}>
      <rect x="2" y="2.5" width="12" height="11" rx="1.3" />
      <path d="M2 5.5h12" />
      <path d="M4.5 8.5h4M4.5 11h6.5" />
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
  /* A tunnel: a door inside a wall, nothing on the outside. */
  'private-endpoint': (
    <svg {...svgProps}>
      <rect x="2" y="2.5" width="12" height="11" rx="1.3" />
      <path d="M5.5 13.5V8a2.5 2.5 0 0 1 5 0v5.5" />
      <path d="M8 10.5v1.5" />
    </svg>
  ),
  /* A hub joined to four spokes. */
  'network-hub': (
    <svg {...svgProps}>
      <circle cx="8" cy="8" r="2" />
      <circle cx="3" cy="3" r="1.3" />
      <circle cx="13" cy="3" r="1.3" />
      <circle cx="3" cy="13" r="1.3" />
      <circle cx="13" cy="13" r="1.3" />
      <path d="M4 4l2.6 2.6M12 4L9.4 6.6M4 12l2.6-2.6M12 12 9.4 9.4" />
    </svg>
  ),
  /* A directory: a magnifier over a list. */
  'service-discovery': (
    <svg {...svgProps}>
      <path d="M3 4h6M3 7h4M3 10h3" />
      <circle cx="10.5" cy="9.5" r="2.5" />
      <path d="m12.3 11.3 2 2" />
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
  /* A folder of files, mounted by many. */
  'file-store': (
    <svg {...svgProps}>
      <path d="M2.5 5.5h4l1.5 1.5h5.5v5.5h-11z" />
      <path d="M2.5 5.5V4h3.5" />
    </svg>
  ),
  /* A stack of discs with a clock hand: restore points in time. */
  'backup-service': (
    <svg {...svgProps}>
      <ellipse cx="7" cy="4" rx="4.5" ry="1.8" />
      <path d="M2.5 4v4.5c0 1 2 1.8 4.5 1.8" />
      <circle cx="11.5" cy="11" r="2.8" />
      <path d="M11.5 9.5V11l1.1.8" />
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
  /* A lens over lines of data: a query run where the data lies. */
  'query-engine': (
    <svg {...svgProps}>
      <circle cx="6.8" cy="6.8" r="3.6" />
      <path d="M9.5 9.5L13 13" />
      <path d="M5.2 6h3.2M5.2 7.8h2.2" />
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
  /* Three steps on an L-shaped arrowed path — the saga's happy route. */
  'workflow-engine': (
    <svg {...svgProps}>
      <rect x="2" y="2.5" width="3.4" height="3.4" rx="0.6" />
      <rect x="10.5" y="2.5" width="3.4" height="3.4" rx="0.6" />
      <rect x="10.5" y="10" width="3.4" height="3.4" rx="0.6" />
      <path d="M5.8 4.2h3.4M8.4 3.4l.9.8-.9.8" />
      <path d="M12.2 6.3v2.6M11.4 8l.8.9.8-.9" />
    </svg>
  ),
  /* A padlock: one holder at a time. */
  'distributed-lock': (
    <svg {...svgProps}>
      <rect x="3.5" y="7" width="9" height="6.5" rx="1" />
      <path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" />
    </svg>
  ),
  /* The number sign — ids, minted in order. */
  'id-generator': (
    <svg {...svgProps}>
      <path d="M6.5 3 5 13M11 3 9.5 13M3.5 6.5H13M3 9.5h9.5" />
    </svg>
  ),
  /* Two slider tracks, thumbs offset — flags mid-rollout. */
  'config-service': (
    <svg {...svgProps}>
      <path d="M2.5 5.5h1.6M7.9 5.5h5.6" />
      <circle cx="6" cy="5.5" r="1.9" />
      <path d="M2.5 10.5h5.6M11.9 10.5h1.6" />
      <circle cx="10" cy="10.5" r="1.9" />
    </svg>
  ),
  /* A branch: a trunk with a side commit. */
  'code-repository': (
    <svg {...svgProps}>
      <circle cx="5" cy="3.5" r="1.5" />
      <circle cx="5" cy="12.5" r="1.5" />
      <circle cx="11" cy="6" r="1.5" />
      <path d="M5 5v6M11 7.5c0 2.5-6 1.5-6 4" />
    </svg>
  ),
  /* Gears: a change worked into an artifact. */
  'build-service': (
    <svg {...svgProps}>
      <circle cx="6.5" cy="8" r="2.2" />
      <path d="M6.5 3.8v1.4M6.5 10.8v1.4M2.3 8h1.4M9.3 8h1.4M3.5 5l1 1M8.5 10l1 1M3.5 11l1-1M8.5 6l1-1" />
      <rect x="10.5" y="9.5" width="3.5" height="3.5" rx="0.8" />
    </svg>
  ),
  /* Stages in a row, each handing on to the next. */
  'deployment-pipeline': (
    <svg {...svgProps}>
      <rect x="1.5" y="6" width="3" height="4" rx="0.8" />
      <rect x="6.5" y="6" width="3" height="4" rx="0.8" />
      <rect x="11.5" y="6" width="3" height="4" rx="0.8" />
      <path d="M4.5 8h2M9.5 8h2" />
    </svg>
  ),
  /* An arrow landing on a fleet, with a way back. */
  'deployment-service': (
    <svg {...svgProps}>
      <path d="M8 2.5v6M5.8 6.3 8 8.5l2.2-2.2" />
      <rect x="2.5" y="10.5" width="3" height="3" rx="0.6" />
      <rect x="6.5" y="10.5" width="3" height="3" rx="0.6" />
      <rect x="10.5" y="10.5" width="3" height="3" rx="0.6" />
    </svg>
  ),
  /* Boxes on a shelf: versions kept. */
  'artifact-registry': (
    <svg {...svgProps}>
      <rect x="2" y="8.5" width="5" height="5" rx="0.8" />
      <rect x="9" y="8.5" width="5" height="5" rx="0.8" />
      <rect x="5.5" y="2.5" width="5" height="5" rx="0.8" />
      <path d="M2 13.5h12" />
    </svg>
  ),
  /* A template: angle brackets over a block. */
  'infrastructure-as-code': (
    <svg {...svgProps}>
      <path d="m5 3.5-2.5 2.5L5 8.5M11 3.5l2.5 2.5L11 8.5" />
      <rect x="4" y="10.5" width="8" height="3" rx="0.8" />
    </svg>
  ),
  /* A person, verified. */
  'auth-service': (
    <svg {...svgProps}>
      <circle cx="6.5" cy="5" r="2.5" />
      <path d="M2.5 13.5c0-2.5 1.8-4 4-4s4 1.5 4 4" />
      <path d="m10.5 5.5 1.5 1.5 2.5-3" />
    </svg>
  ),
  /* The kv-store's key, kept inside a shield. */
  'secrets-manager': (
    <svg {...svgProps}>
      <path d="M8 1.5l5 1.8v4.2c0 3.3-2.2 5.3-5 6.3-2.8-1-5-3-5-6.3V3.3z" />
      <circle cx="6.3" cy="6.3" r="1.4" />
      <path d="M7.3 7.3l2.4 2.4M9 9l1-1" />
    </svg>
  ),
  /* The same shield, built from bricks — a wall at the edge. */
  waf: (
    <svg {...svgProps}>
      <path d="M8 1.5l5 1.8v4.2c0 3.3-2.2 5.3-5 6.3-2.8-1-5-3-5-6.3V3.3z" />
      <path d="M3.2 6.2h9.6M3.6 9.4h8.8" />
      <path d="M8 3.4v2.8M5.7 6.2v3.2M10.3 6.2v3.2M8 9.4v3.4" />
    </svg>
  ),
  /* A certificate: ruled lines and the seal at its foot. */
  'certificate-manager': (
    <svg {...svgProps}>
      <rect x="2.5" y="2.5" width="11" height="8.5" rx="1.2" />
      <path d="M5 5.5h6M5 8h4" />
      <circle cx="11.5" cy="12" r="1.8" />
    </svg>
  ),
  /* A lock, open to a check: the caller may. */
  'authorization-service': (
    <svg {...svgProps}>
      <rect x="3" y="7" width="10" height="7" rx="1.3" />
      <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
      <path d="m6.3 10.5 1.3 1.3 2.3-2.3" />
    </svg>
  ),
  /* A clipboard with a check and a line. */
  'compliance-service': (
    <svg {...svgProps}>
      <rect x="3.5" y="3" width="9" height="11" rx="1.2" />
      <path d="M6 2.5h4v2H6z" />
      <path d="m5.8 8.5 1.4 1.4 2.6-2.6M5.8 12h4.4" />
    </svg>
  ),
  /* An eye watching from a shield. */
  'threat-detection': (
    <svg {...svgProps}>
      <path d="M8 1.5l5 1.8v4.2c0 3.3-2.2 5.3-5 6.3-2.8-1-5-3-5-6.3V3.3z" />
      <path d="M4.5 8c1-1.6 2.2-2.4 3.5-2.4S10.5 6.4 11.5 8c-1 1.6-2.2 2.4-3.5 2.4S5.5 9.6 4.5 8z" />
      <circle cx="8" cy="8" r="1" />
    </svg>
  ),
  /* A speedometer: the dial the operators watch. */
  monitoring: (
    <svg {...svgProps}>
      <path d="M2.5 11a5.5 5.5 0 0 1 11 0" />
      <path d="M2.5 11h11M8 11l2.8-3.6" />
    </svg>
  ),
  /* A ruled document — structured lines of log. */
  logging: (
    <svg {...svgProps}>
      <rect x="3.5" y="2" width="9" height="12" rx="1.2" />
      <path d="M5.8 5.5h4.4M5.8 8h4.4M5.8 10.5h2.8" />
    </svg>
  ),
  /* Three spans descending a stepped path — one request, hop by hop. */
  tracing: (
    <svg {...svgProps}>
      <path d="M5.1 3.5H8v2M7.1 4.6l.9.9.9-.9" />
      <path d="M9.6 8h2.9v2M11.6 9.1l.9.9.9-.9" />
      <circle cx="3.5" cy="3.5" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="12.5" cy="12.5" r="1.5" />
    </svg>
  ),
  'external-api': (
    <svg {...svgProps}>
      <rect x="2.5" y="2.5" width="7" height="11" rx="1.5" />
      <path d="M9.5 8h4M11.5 6l2 2-2 2" />
    </svg>
  ),
  /* A payment card: magstripe and chip-side dot. */
  'payment-provider': (
    <svg {...svgProps}>
      <rect x="2" y="3.5" width="12" height="9" rx="1.2" />
      <path d="M2 6h12" />
      <circle cx="11.5" cy="10" r="1.2" />
    </svg>
  ),
} as const satisfies Record<NodeKind, ReactElement>;
