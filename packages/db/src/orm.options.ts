import { UnderscoreNamingStrategy } from '@mikro-orm/core';
import { ReflectMetadataProvider } from '@mikro-orm/decorators/legacy';

import { DesignRevision } from './entities/design-revision.entity';
import { DesignSession } from './entities/design-session.entity';
import { ExperienceProfile } from './entities/experience-profile.entity';
import { GovconOpportunity } from './entities/govcon-opportunity.entity';
import { GovconSourceCall } from './entities/govcon-source-call.entity';
import { MemoryEmbedding } from './entities/memory-embedding.entity';
import { OrchestrationRun } from './entities/orchestration-run.entity';
import { OrchestrationRunChild } from './entities/orchestration-run-child.entity';
import { QualityRun } from './entities/quality-run.entity';
import { QualityRunCriterion } from './entities/quality-run-criterion.entity';
import { QualityRunCriterionResult } from './entities/quality-run-criterion-result.entity';
import { QualityRunFinding } from './entities/quality-run-finding.entity';
import { QualityRunIteration } from './entities/quality-run-iteration.entity';
import { Prompt } from './entities/prompt.entity';
import { PromptGeneration } from './entities/prompt-generation.entity';
import { StarStory } from './entities/star-story.entity';

/**
 * ORM settings shared by every entry point that configures MikroORM: the
 * studio API's, the quality loop's and govcon's DbModules, and
 * `mikro-orm.config.ts` (the CLI that creates and applies migrations).
 *
 * They have to agree. `namingStrategy` in particular decides whether the apps
 * query `revision_number` or `revisionNumber` — and since migrations are
 * produced from the CLI side, a mismatch means an app cannot read the tables
 * the CLI just created. One shared object makes the drift unrepresentable.
 */
export const ormOptions = {
  host: process.env['DB_HOST'] ?? 'localhost',
  port: parseInt(process.env['DB_PORT'] ?? '5432', 10),
  user: process.env['DB_USERNAME'] ?? 'admin',
  password: process.env['DB_PASSWORD'] ?? 'admin',
  dbName: process.env['DB_NAME'] ?? 'sysdesign',

  entities: [
    ExperienceProfile,
    Prompt,
    PromptGeneration,
    DesignSession,
    DesignRevision,
    MemoryEmbedding,
    OrchestrationRun,
    OrchestrationRunChild,
    QualityRun,
    QualityRunCriterion,
    QualityRunIteration,
    QualityRunFinding,
    QualityRunCriterionResult,
    StarStory,
    GovconOpportunity,
    GovconSourceCall,
  ],
  metadataProvider: ReflectMetadataProvider,
  namingStrategy: UnderscoreNamingStrategy,
};
