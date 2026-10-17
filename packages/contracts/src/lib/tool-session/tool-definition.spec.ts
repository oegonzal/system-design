import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { sampleTools } from './fixtures';
import {
  renderToolLines,
  toolDeclarationOf,
  toolDeclarationSchema,
  ToolNameMalformed,
} from './tool-definition';

describe('a tool as a program declares it', () => {
  it('[QL-72] is written for the wire with its parameters as JSON schema — the required keys named, the dialect line dropped — and read back by the same schema', () => {
    const [list] = sampleTools();
    expect(list?.parameters['required']).toEqual(['query', 'limit']);
    expect(list?.parameters['$schema']).toBeUndefined();
    // What a caller sends is read with the declared keys alone: the reader treats an unstated
    // `additionalProperties` as closed, and the schema never opens it.
    expect(list?.parameters['additionalProperties']).not.toBe(true);
    for (const tool of sampleTools()) expect(toolDeclarationSchema.parse(tool)).toEqual(tool);
    expect(
      toolDeclarationSchema.safeParse({ ...list, name: 'List Items' }).success,
      'a name the grammar does not read',
    ).toBe(false);
  });

  it('[QL-72] refuses a name the grammar does not read before any goal could name it', () => {
    const malformed = {
      name: 'listItems',
      description: 'x',
      parameters: z.object({}),
      effect: 'read' as const,
      approval: false,
    };
    expect(() => toolDeclarationOf(malformed, 'example')).toThrow(ToolNameMalformed);
  });

  it('[QL-72] renders for the model one line per tool and one per parameter: its type, whether it is required, and the words it was described with', () => {
    const [list, , remove] = sampleTools();
    if (list === undefined || remove === undefined) throw new Error('fixture tools missing');
    expect(renderToolLines(list)).toEqual([
      '- list_items (read): The items listed, newest first.',
      '  - query: string — Words an item must match; empty for every item.',
      '  - limit: integer | null — At most this many; null for the default.',
    ]);
    expect(renderToolLines(remove)[0]).toBe(
      '- remove_item (irreversible, asks you first): Removes one item for good.',
    );
    const optional = toolDeclarationOf(
      {
        name: 'ping',
        description: 'Answers.',
        parameters: z.object({ note: z.string().optional() }),
        effect: 'read',
        approval: false,
      },
      'example',
    );
    expect(renderToolLines(optional)).toEqual(['- ping (read): Answers.', '  - note?: string']);
    const bare = toolDeclarationOf(
      {
        name: 'now',
        description: 'The time.',
        parameters: z.object({}),
        effect: 'read',
        approval: false,
      },
      'example',
    );
    expect(renderToolLines(bare)).toEqual(['- now (read): The time.', '  - (no parameters)']);
  });
});
