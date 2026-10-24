/**
 * How records live in Qdrant: one collection per index generation, embedding
 * model and width; the payload indexes a search filters by; and the
 * visibility filter itself — the rule `pointVisible` states for the in-memory
 * index, and `scope <@ request` states for Postgres, as Qdrant conditions.
 */
import type { Schemas } from '@qdrant/js-client-rest';
import type { RecordScope } from '@sysdesign/contracts';
import { collectionName as qdrantCollection } from '@sysdesign/qdrant-kit';

import type { PointPayload, VisibilityFilter } from '../../ports';

/**
 * What is embedded is part of the vector space, as the model and the width
 * are: cosines across two representations are not comparable. Bump this
 * whenever the text a record embeds changes; the sweep fills the new
 * collection, since every current record is then due for it.
 */
const INDEX_GENERATION = 'v1';

/** Bound to the generation, the model and the width, so vectors of two spaces never share a ranking. */
export const collectionName = (model: string, dimensions: number): string =>
  qdrantCollection('agentic-memory', INDEX_GENERATION, model, dimensions);

type Condition = Schemas['Condition'];
type IndexSchema = Extract<Schemas['PayloadSchemaType'], 'keyword' | 'datetime'>;

/**
 * The payload fields every search filters by, each with the index type it is
 * filtered as: keyword for an exact match, datetime for a range over time.
 */
const CORE_INDEXES = {
  spaceId: 'keyword',
  register: 'keyword',
  partition: 'keyword',
  validFrom: 'datetime',
  expiresAt: 'datetime',
} as const satisfies Partial<Record<keyof PointPayload, IndexSchema>>;

/** The scope keys a filter reads from a point's `scope`: every policy key but the first, which travels as `partition`. */
const narrowingKeys = (scopeKeys: readonly string[]): readonly string[] => scopeKeys.slice(1);

const scopeField = (key: string): string => `scope.${key}`;

/** The indexes a collection carries: the core fields, and one keyword index per scope key a filter reads. */
export const payloadIndexes = (
  scopeKeys: readonly string[],
): { field: string; schema: IndexSchema }[] => [
  ...Object.entries(CORE_INDEXES).map(([field, schema]) => ({ field, schema })),
  ...narrowingKeys(scopeKeys).map((key) => ({
    field: scopeField(key),
    schema: 'keyword' as const,
  })),
];

const matching = (key: string, value: string): Condition => ({ key, match: { value } });

/** A field the point does not carry. `is_empty`, not `is_null`: an absent key is not a null one. */
const unset = (key: string): Condition => ({ is_empty: { key } });

const eitherOf = (...conditions: Condition[]): Condition => ({ should: conditions });

/**
 * Beyond the partition, each policy scope key is unset on the point or — when
 * the request names the key — equal to the request's. Read over the policy's
 * keys, never the request's, so a key the request leaves out still keeps a
 * narrower memory out: a tenant-wide memory reaches every user in the tenant,
 * a user's memory no tenant-wide request.
 */
const scopeConditions = (scope: RecordScope, scopeKeys: readonly string[]): Condition[] =>
  narrowingKeys(scopeKeys).map((key) =>
    key in scope
      ? eitherOf(unset(scopeField(key)), matching(scopeField(key), scope[key]))
      : unset(scopeField(key)),
  );

/** The valid-time range as one condition, or none when the filter names neither end. */
const validFromConditions = ({ since, until }: VisibilityFilter): Condition[] =>
  since === undefined && until === undefined
    ? []
    : [
        {
          key: 'validFrom',
          range: {
            ...(since === undefined ? {} : { gte: since.toISOString() }),
            ...(until === undefined ? {} : { lt: until.toISOString() }),
          },
        },
      ];

/**
 * The visibility a search applies: in the space, one of the registers and the
 * partition, within the scope, unexpired at `now`, valid from within the time
 * range, and carrying every metadata value asked for.
 */
export function filterOf(filter: VisibilityFilter): { must: Condition[] } {
  return {
    must: [
      matching('spaceId', filter.spaceId),
      { key: 'register', match: { any: [...filter.registers] } },
      matching('partition', filter.partition),
      ...scopeConditions(filter.scope, filter.scopeKeys),
      eitherOf(unset('expiresAt'), { key: 'expiresAt', range: { gt: filter.now.toISOString() } }),
      ...validFromConditions(filter),
      ...Object.entries(filter.where ?? {}).map(([field, value]) =>
        matching(`metadata.${field}`, value),
      ),
    ],
  };
}
