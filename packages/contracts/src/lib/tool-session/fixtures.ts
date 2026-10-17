/**
 * The fixtures every tool-session spec composes over: a mission that names
 * no real service, three tools of the three effects, and the goal input a
 * spec overrides one field of. Pure helpers — no vitest import — so the
 * pipeline's specs and the programs' can share them.
 */
import { z } from 'zod';

import { toolDeclarationOf, type ToolDeclaration } from './tool-definition';
import type { ToolGoalInput, ToolObservation } from './tool-goal';

export const TOOL_MISSION_FIXTURE = `# Mission

Keep the list of items on the example service tidy: read what is listed, note each item that lacks a note, and remove nothing unless an item is marked for removal.

## Procedure

1. List the items.
2. For every item without a note, update it with a note saying when it was reviewed.
3. When every listed item has a note, finish.

## Stop conditions

- nothing-left (complete): every listed item has a note.
- service-down (stopped): the list cannot be read twice in a row.

## Never do

- Never remove an item that is not marked for removal.
`;

/** The program the fixture tools belong to, by the source it would publish under. */
export const FIXTURE_PROVIDER = 'example';

/** Three tools of the three effects, declared as a program declares them and written as the wire carries them. */
export const sampleTools = (): ToolDeclaration[] => [
  toolDeclarationOf(
    {
      name: 'list_items',
      description: 'The items listed, newest first.',
      parameters: z.object({
        query: z.string().describe('Words an item must match; empty for every item.'),
        limit: z.number().int().nullable().describe('At most this many; null for the default.'),
      }),
      effect: 'read',
      approval: false,
    },
    FIXTURE_PROVIDER,
  ),
  toolDeclarationOf(
    {
      name: 'update_item',
      description: 'Sets the note on one item.',
      parameters: z.object({ id: z.string(), note: z.string() }),
      effect: 'write',
      approval: false,
    },
    FIXTURE_PROVIDER,
  ),
  toolDeclarationOf(
    {
      name: 'remove_item',
      description: 'Removes one item for good.',
      parameters: z.object({ id: z.string() }),
      effect: 'irreversible',
      approval: true,
    },
    FIXTURE_PROVIDER,
  ),
];

export const sampleObservation = (overrides: Partial<ToolObservation> = {}): ToolObservation => ({
  step: 1,
  tool: 'list_items',
  argumentsJson: '{"query":"","limit":null}',
  outcome: 'ok',
  result: '- i1 "Alpha" — no note\n- i2 "Beta" — reviewed 2026-10-01',
  ...overrides,
});

/** The goal input at the first step over the fixture mission and tools, with nothing observed, unless a spec says. */
export const toolGoalInput = (overrides: Partial<ToolGoalInput> = {}): ToolGoalInput => ({
  mission: TOOL_MISSION_FIXTURE,
  now: '2026-10-16T12:00:00.000Z',
  tools: sampleTools(),
  observations: [],
  omittedObservations: 0,
  history: [],
  objections: [],
  progress: { criteria: [], settled: [] },
  observed: false,
  lastStep: null,
  stepsLeft: 30,
  ...overrides,
});
