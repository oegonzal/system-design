import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/decorators/legacy';

/**
 * A memory space: one memory strategy made executable by the agentic-memory
 * runtime. It keeps the strategy and the policy it was created under as
 * snapshots, so it compiles the same on every load and does not change when the
 * run or the policy file does. `designRunId` is the loop run the strategy came
 * from — a plain column, never a foreign key, since the loop is another service.
 * A space may carry the name a consumer ensures it under, and no two spaces
 * hold one name: the partial unique index refuses the second, and a space made
 * without a name holds null, which the index leaves out.
 */
@Entity()
@Index({
  name: 'memory_space_name_unique',
  expression: `create unique index "memory_space_name_unique" on "memory_space" ("name") where "name" is not null`,
})
export class MemorySpace {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  /** The name it was ensured under — the contracts' `MEMORY_SPACE_NAME_MAX_LENGTH` wide; null for a space made without one. */
  @Property({ type: 'varchar', length: 80, nullable: true })
  name: string | null = null;

  @Property({ type: 'varchar', length: 80 })
  designRunId!: string;

  /** The strategy as the run's best iteration wrote it. */
  @Property({ type: 'json' })
  strategy!: unknown;

  /** The policy the space was created under. */
  @Property({ type: 'json' })
  policy!: unknown;

  /** Which declared policy the snapshot was taken from. */
  @Property({ type: 'text' })
  policySource!: string;

  @Property({ type: 'timestamptz' })
  createdAt!: Date;
}
