/**
 * A call's arguments, read the one way both sides read them: the validator
 * in the loop, against the tool's declared parameters from the goal's index;
 * the program, before it runs the call. The check here is shallow on purpose
 * — one JSON object, the declared keys and no other, every required key
 * present, each top-level value of its declared type — and needs no
 * dependency: the program's own parameter schema is the full check at
 * execution, and a refusal there becomes the next plan's objection.
 */

/** A JSON schema as `z.toJSONSchema` writes one, read for its top-level shape only. */
export type JsonSchemaObject = Record<string, unknown>;

export interface ArgumentFault {
  /** The parameter the fault is about, or null for the object as a whole. */
  key: string | null;
  message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The one JSON object a call's arguments must be, or null when the text is not that. */
export function parseArguments(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** The JSON type word of a value, as a schema names it. */
const jsonTypeOf = (value: unknown): string => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value;
};

/** The type words a property schema admits: its `type`, or the types of its `anyOf` branches; none when it declares neither. */
function admittedTypes(property: unknown): string[] {
  if (!isRecord(property)) return [];
  const { type, anyOf } = property;
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type.filter((each): each is string => typeof each === 'string');
  if (Array.isArray(anyOf)) return anyOf.flatMap(admittedTypes);
  return [];
}

/** The values a property schema enumerates, from its own `enum` or its branches'; none when it enumerates nothing. */
function enumerated(property: unknown): unknown[] | null {
  if (!isRecord(property)) return null;
  if (Array.isArray(property['enum'])) return property['enum'];
  if (Array.isArray(property['anyOf'])) {
    const branches = property['anyOf'].map(enumerated);
    if (branches.some((branch) => branch === null)) return null;
    return branches.flat();
  }
  return null;
}

const typeAdmits = (admitted: readonly string[], value: unknown): boolean => {
  const actual = jsonTypeOf(value);
  return admitted.some((type) => type === actual || (type === 'number' && actual === 'integer'));
};

/**
 * Every way the arguments fall short of the parameters, shallowly: a key the
 * tool does not declare, a required key missing, a value not of its declared
 * type, a value not among those enumerated. Empty for arguments that fit.
 */
export function argumentFaults(
  args: Record<string, unknown>,
  parameters: JsonSchemaObject,
): ArgumentFault[] {
  const faults: ArgumentFault[] = [];
  const properties = isRecord(parameters['properties']) ? parameters['properties'] : {};
  const required = Array.isArray(parameters['required'])
    ? parameters['required'].filter((key): key is string => typeof key === 'string')
    : [];
  const open = parameters['additionalProperties'] === true;
  for (const key of Object.keys(args)) {
    if (!open && !Object.hasOwn(properties, key)) {
      faults.push({ key, message: `${key} is not a parameter the tool declares` });
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(args, key)) faults.push({ key, message: `${key} is required and missing` });
  }
  for (const [key, property] of Object.entries(properties)) {
    if (!Object.hasOwn(args, key)) continue;
    const value = args[key];
    const admitted = admittedTypes(property);
    if (admitted.length > 0 && !typeAdmits(admitted, value)) {
      faults.push({
        key,
        message: `${key} is ${jsonTypeOf(value)}; the tool declares ${admitted.join(' | ')}`,
      });
      continue;
    }
    const allowed = enumerated(property);
    if (allowed !== null && !allowed.some((each) => Object.is(each, value))) {
      faults.push({
        key,
        message: `${key} is not one of ${allowed.map((each) => JSON.stringify(each)).join(', ')}`,
      });
    }
  }
  return faults;
}

const sortedDeep = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortedDeep);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedDeep(value[key])]),
  );
};

/** The arguments as one string that reads the same however the keys were ordered: the identity of a call. */
export const canonicalArguments = (args: Record<string, unknown>): string =>
  JSON.stringify(sortedDeep(args));

/** Whether two argument texts name the same arguments: by their canonical form when both parse, else by the text. */
export function sameArguments(a: string, b: string): boolean {
  const left = parseArguments(a);
  const right = parseArguments(b);
  if (left === null || right === null) return a === b;
  return canonicalArguments(left) === canonicalArguments(right);
}
