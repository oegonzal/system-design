import { describe, expect, it } from 'vitest';

import { makeGraph, makePlatformGraph } from '../../testing/canvas-fixtures';
import { diagramMarkdown } from './markdown-diagram';

describe('diagramMarkdown', () => {
  it('[UX-31] tables every block with its role, the service it names and its config, and every connection with its call style, carries and config', () => {
    const md = diagramMarkdown(makePlatformGraph());
    expect(md).toContain('| Block | Role | Service | Config |');
    expect(md).toContain('| Shopper | Client | — | — |');
    expect(md).toContain('| Orders API | API Gateway | API Gateway | — |');
    expect(md).toContain('| Order events | Queue | SQS | queueType=fifo |');
    expect(md).toContain('| From → To | Call style | Carries | Config |');
    expect(md).toContain('| Shopper → Orders API | sync | — | — |');
    expect(md).toContain(
      '| Place order → Order events | async | — | delivery=at-least-once, dlq=true |',
    );
  });

  it('prints the carried operations and says None for an empty diagram', () => {
    const md = diagramMarkdown(
      makeGraph({
        edges: [{ id: 'e-1', source: 'n-1', target: 'n-2', kind: 'sync', carries: ['placeOrder'] }],
      }),
    );
    expect(md).toContain('| Client → Order Service | sync | placeOrder | — |');
    expect(diagramMarkdown({ nodes: [], edges: [] })).toContain('_None._');
  });
});
