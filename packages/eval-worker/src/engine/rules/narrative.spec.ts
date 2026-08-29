import type { CanvasGraph } from '@sysdesign/contracts';
import { describe, expect, it } from 'vitest';

import { contextFor, edge, flashSaleFacts, graph, node, ruleById } from '../testing';

function ctx(canvas: CanvasGraph, narrative: string | null = null) {
  return contextFor(canvas, flashSaleFacts(), narrative);
}

describe('hygiene.narrative-unexplained-components', () => {
  const rule = ruleById('hygiene.narrative-unexplained-components');
  const canvas = graph(
    [
      node('gw-1', 'gateway', { label: 'API Gateway' }),
      node('svc-1', 'service', { label: 'Order Service' }),
      node('db-1', 'database', { label: 'Orders DB' }),
    ],
    [edge('e1', 'gw-1', 'svc-1'), edge('e2', 'svc-1', 'db-1')],
  );

  it('fires when the narrative skips components, naming them and marking their nodes', () => {
    const findings = rule.check(ctx(canvas, 'The API Gateway authenticates every request.'));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('medium');
    expect(findings[0].message).toContain('"Order Service", "Orders DB"');
    expect(findings[0].affectedNodeIds).toEqual(['db-1', 'svc-1']);
    expect(findings[0].suggestion).toBeNull();
  });

  it('clips the named labels at five with a +N more marker', () => {
    const wide = graph(
      Array.from({ length: 7 }, (_, i) => node(`n-${i}`, 'service', { label: `Widget ${i}` })),
    );
    const findings = rule.check(ctx(wide, 'A story about nothing on the canvas.'));
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('"Widget 4" +2 more');
    expect(findings[0].message).not.toContain('Widget 5');
    expect(findings[0].affectedNodeIds).toHaveLength(7);
  });

  it('stays silent when every label appears in the story', () => {
    const story = 'The API Gateway routes to the Order Service, which owns the Orders DB.';
    expect(rule.check(ctx(canvas, story))).toEqual([]);
  });

  it('stays silent with no narrative, even on an unexplained canvas', () => {
    expect(rule.check(ctx(canvas))).toEqual([]);
    expect(rule.check(ctx(canvas, '   '))).toEqual([]);
  });
});

describe('hygiene.narrative-too-thin', () => {
  const rule = ruleById('hygiene.narrative-too-thin');
  const canvas = graph([
    node('gw-1', 'gateway', { label: 'Gw' }),
    node('svc-1', 'service', { label: 'Svc' }),
    node('db-1', 'database', { label: 'Db' }),
  ]);

  it('fires when a short story fronts a real canvas, citing the word count', () => {
    const findings = rule.check(ctx(canvas, 'Gw talks to Svc which owns Db.'));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('low');
    expect(findings[0].message).toContain('7 words');
  });

  it('stays silent at thirty words or more', () => {
    const story = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
    expect(rule.check(ctx(canvas, story))).toEqual([]);
  });

  it('stays silent when the canvas itself is tiny', () => {
    const tiny = graph([node('gw-1', 'gateway'), node('db-1', 'database')]);
    expect(rule.check(ctx(tiny, 'Short.'))).toEqual([]);
  });

  it('stays silent with no narrative, even on an empty canvas', () => {
    expect(rule.check(ctx(graph([])))).toEqual([]);
  });
});

describe('hygiene.narrative-no-flow-story', () => {
  const rule = ruleById('hygiene.narrative-no-flow-story');
  const canvas = graph(
    [node('svc-1', 'service', { label: 'Svc' }), node('db-1', 'database', { label: 'Db' })],
    [edge('e1', 'svc-1', 'db-1')],
  );

  it('fires when edges exist but the story never uses a flow verb', () => {
    const story = 'Svc is the heart of the system and Db is its durable home for order state.';
    const findings = rule.check(ctx(canvas, story));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('info');
  });

  it('stays silent once any flow verb appears, case-insensitively', () => {
    expect(rule.check(ctx(canvas, 'Svc WRITES order state into Db.'))).toEqual([]);
    expect(rule.check(ctx(canvas, 'Svc publishes facts for Db.'))).toEqual([]);
  });

  it('stays silent on a canvas with no edges', () => {
    const edgeless = graph([node('svc-1', 'service', { label: 'Svc' })]);
    expect(rule.check(ctx(edgeless, 'Svc stands alone.'))).toEqual([]);
  });

  it('stays silent with no narrative, even on an empty canvas', () => {
    expect(rule.check(ctx(graph([])))).toEqual([]);
    expect(rule.check(ctx(canvas, null))).toEqual([]);
  });
});
