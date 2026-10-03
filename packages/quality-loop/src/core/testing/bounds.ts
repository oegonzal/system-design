/**
 * The length bounds a schema shows the model. Pure helpers only — no vitest
 * imports, so this file compiles under the app tsconfig even though only
 * specs use it.
 */
import { modelSchema } from '@sysdesign/contracts';
import type { ZodType } from 'zod';

/**
 * Every string bound in a schema, by path — `summary`, `roles[].responsibility`,
 * `assumptions[]` — read off its JSON Schema, the form the model is given:
 * each declared bound at its TARGET. A pipeline spec holds this against the
 * longest each path has measurably been written: a target the model meets is
 * an overrun on every reply, kept and recorded but never what was asked for.
 */
export function proseBounds(schema: ZodType): Record<string, number> {
  const bounds: Record<string, number> = {};
  const visit = (node: unknown, path: string): void => {
    if (node === null || typeof node !== 'object') return;
    const json = node as Record<string, unknown>;
    if (typeof json['maxLength'] === 'number') bounds[path] = json['maxLength'];
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
      const branches = json[key];
      if (Array.isArray(branches)) for (const branch of branches) visit(branch, path);
    }
    if (json['items'] !== undefined) visit(json['items'], `${path}[]`);
    const properties = json['properties'];
    if (properties !== null && typeof properties === 'object') {
      for (const [key, child] of Object.entries(properties)) {
        visit(child, path === '' ? key : `${path}.${key}`);
      }
    }
  };
  visit(modelSchema(schema).json, '');
  return bounds;
}

/**
 * The paths whose bound is not above the longest measured — empty when every
 * bound clears its measurement — and any measured path the schema no longer
 * has, so a renamed field cannot quietly drop out of the check.
 */
export function boundsBelowMeasured(
  schema: ZodType,
  measured: Readonly<Record<string, number>>,
): string[] {
  const bounds = proseBounds(schema);
  return Object.entries(measured).flatMap(([path, longest]) => {
    const bound = bounds[path];
    if (bound === undefined) return [`${path}: no bound in the schema`];
    return bound > longest ? [] : [`${path}: bound ${bound} ≤ measured ${longest}`];
  });
}

/** The stages of a definition that declare an output cap, as a spec names them. */
interface CappedStages {
  deriveCriteria: { maxTokens: number };
  producer: { maxTokens: number };
  critics: readonly { id: string; maxTokens: number }[];
  evaluators: readonly { id: string; maxTokens: number }[];
}

/** Every declared output cap by stage: `criteria`, `producer`, then each lens by id. */
export const declaredCaps = (definition: CappedStages): Record<string, number> =>
  Object.fromEntries([
    ['criteria', definition.deriveCriteria.maxTokens],
    ['producer', definition.producer.maxTokens],
    ...[...definition.critics, ...definition.evaluators].map(
      (lens) => [lens.id, lens.maxTokens] as const,
    ),
  ]);

/**
 * The stages whose declared output cap is not above the most they have
 * measurably written — empty when every cap clears its measurement — and any
 * measured stage the definition no longer declares. A cap is also the call's
 * time limit (`callTimeLimitMs`), so one a stage outwrites is a call cut short.
 */
export function capsBelowMeasured(
  definition: CappedStages,
  measured: Readonly<Record<string, number>>,
): string[] {
  const caps = declaredCaps(definition);
  return Object.entries(measured).flatMap(([stage, most]) => {
    const cap = caps[stage];
    if (cap === undefined) return [`${stage}: no such stage`];
    return cap > most ? [] : [`${stage}: cap ${cap} ≤ measured ${most}`];
  });
}
