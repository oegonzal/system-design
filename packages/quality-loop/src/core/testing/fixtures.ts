/**
 * Small builders the pipeline specs share: text at a cap, a contract around a
 * task, and the scalar types a model-facing schema would ask for.
 */
import { z, type ZodType } from 'zod';

import type { TaskContract, TaskSpec } from '../contracts';

/** `length` characters of `char` — a field at its cap. */
export const fill = (length: number, char = 'x'): string => char.repeat(length);

/** A task's contract around a goal, with no criteria unless a spec gives some. */
export const contractOf = <T>(
  task: TaskSpec<T>,
  goal: string,
  criteria: TaskContract<T>['criteria'] = [],
): TaskContract<T> => ({ ...task, goal, criteria });

/** Every `type` the JSON Schema of a zod schema declares, anywhere in it. */
export function jsonSchemaTypes(schema: ZodType): string[] {
  const types: string[] = [];
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (typeof record['type'] === 'string') types.push(record['type']);
      Object.values(record).forEach(walk);
    }
  };
  walk(z.toJSONSchema(schema));
  return types;
}
