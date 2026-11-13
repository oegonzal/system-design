import { Module } from '@nestjs/common';
import { DbModule } from '@sysdesign/nest-kit';

/**
 * What `main.js import-qdrant` boots: the database the memory table lives in,
 * and nothing else — no model provider, since no model is called; no
 * embedding client built by the module, since the collection's name says
 * which model and width the store is for; no HTTP surface.
 */
@Module({ imports: [DbModule] })
export class ImportQdrantModule {}
