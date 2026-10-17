/**
 * A tool as a program declares it — a name, what it does, the parameters it
 * takes as a zod object, what it does to the world and whether a person
 * approves each call before it runs — and the declaration the wire carries:
 * the same facts with the parameters as JSON schema, which is what the goal's
 * index holds, what `GET /tools` serves, and what a peer program reads to
 * offer another program's tools as its own.
 */
import { z } from 'zod';

import { SOURCE_MAX_LENGTH } from '../notifications/bus';
import type { JsonSchemaObject } from './arguments';
import {
  TOOL_DESCRIPTION_MAX_LENGTH,
  TOOL_EFFECT_KINDS,
  TOOL_NAME,
  TOOL_NAME_MAX_LENGTH,
  type ToolEffectKind,
} from './vocab';

/** A tool as the program that runs it declares it; `run` is the program's, not the contract's. */
export interface ToolDefinition<P extends z.ZodObject = z.ZodObject> {
  name: string;
  description: string;
  parameters: P;
  effect: ToolEffectKind;
  /** Whether a person says yes to each call before it runs. */
  approval: boolean;
}

/** A tool as the wire carries it: the goal's index, `GET /tools`, a peer's offer. */
export const toolDeclarationSchema = z.strictObject({
  name: z.string().regex(TOOL_NAME).max(TOOL_NAME_MAX_LENGTH),
  description: z.string().min(1).max(TOOL_DESCRIPTION_MAX_LENGTH),
  parameters: z.record(z.string(), z.unknown()),
  effect: z.enum(TOOL_EFFECT_KINDS),
  approval: z.boolean(),
  /** The program that runs it, by the source it publishes under. */
  provider: z.string().min(1).max(SOURCE_MAX_LENGTH),
});
export type ToolDeclaration = z.infer<typeof toolDeclarationSchema>;

/** A tool name the grammar does not read; the catalog is refused before any goal names it. */
export class ToolNameMalformed extends Error {
  override readonly name = 'ToolNameMalformed';
  constructor(readonly tool: string) {
    super(
      `${JSON.stringify(tool)} is not a tool name — lower-case words joined by underscores, at most ${TOOL_NAME_MAX_LENGTH} characters`,
    );
  }
}

/** The declaration of a defined tool, its parameters written as the JSON schema the wire and the index carry. */
export function toolDeclarationOf(
  tool: ToolDefinition<z.ZodObject>,
  provider: string,
): ToolDeclaration {
  if (!TOOL_NAME.test(tool.name) || tool.name.length > TOOL_NAME_MAX_LENGTH) {
    throw new ToolNameMalformed(tool.name);
  }
  // The dialect line says nothing a reader of the parameters needs, and every tool would repeat it.
  // What a caller sends: a parameter with a default or marked optional may be left out.
  const { $schema: _dialect, ...parameters } = z.toJSONSchema(tool.parameters, {
    io: 'input',
  }) as JsonSchemaObject;
  return {
    name: tool.name,
    description: tool.description,
    parameters,
    effect: tool.effect,
    approval: tool.approval,
    provider,
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** One parameter's type as a reader says it: `string`, `integer | null`, `array of string`, `one of a, b`. */
function describeType(property: unknown): string {
  if (!isRecord(property)) return 'any';
  if (Array.isArray(property['enum'])) {
    return `one of ${property['enum'].map((each) => JSON.stringify(each)).join(', ')}`;
  }
  if (Array.isArray(property['anyOf'])) return property['anyOf'].map(describeType).join(' | ');
  const { type } = property;
  if (type === 'array') return `array of ${describeType(property['items'])}`;
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) return type.join(' | ');
  return 'any';
}

/**
 * A tool as the model reads it: one line for the tool, then one indented
 * line per parameter with its type, whether it is required, and the words
 * its schema describes it with.
 */
export function renderToolLines(tool: ToolDeclaration): string[] {
  const properties = isRecord(tool.parameters['properties']) ? tool.parameters['properties'] : {};
  const required = Array.isArray(tool.parameters['required']) ? tool.parameters['required'] : [];
  const head = `- ${tool.name} (${tool.effect}${tool.approval ? ', asks you first' : ''}): ${tool.description}`;
  const parameters = Object.entries(properties).map(([key, property]) => {
    const optional = required.includes(key) ? '' : '?';
    const description =
      isRecord(property) && typeof property['description'] === 'string'
        ? ` — ${property['description']}`
        : '';
    return `  - ${key}${optional}: ${describeType(property)}${description}`;
  });
  return [head, ...(parameters.length === 0 ? ['  - (no parameters)'] : parameters)];
}
