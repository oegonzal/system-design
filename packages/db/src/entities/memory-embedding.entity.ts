import type { Opt } from '@mikro-orm/core';
import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/decorators/legacy';

/**
 * The embedding cache: one vector per (model, exact text), keyed by the text's
 * sha256 so a prompt or a lesson is embedded once per model, across processes.
 * Only ever looked up by hash — the vector store does similarity — so the
 * vector is plain jsonb here.
 */
@Entity()
@Unique({ properties: ['model', 'contentHash'] })
export class MemoryEmbedding {
  @PrimaryKey({ type: 'uuid' })
  id: string = crypto.randomUUID();

  @Property({ type: 'varchar', length: 80 })
  model!: string;

  /** sha256 hex of the exact text sent to the provider. */
  @Property({ type: 'varchar', length: 64 })
  contentHash!: string;

  @Property({ type: 'json' })
  embedding!: number[];

  @Property({ type: 'timestamptz' })
  createdAt: Opt<Date> = new Date();
}
