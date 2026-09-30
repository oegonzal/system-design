import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ormOptions } from '@sysdesign/db';

/**
 * The one MikroORM root every Nest app imports. `ormOptions` already lists
 * every entity, so there is deliberately no `autoLoadEntities`: combining the
 * two registers each entity twice, which surfaces as "Duplicate table names
 * are not allowed" only in the bundled build.
 */
@Module({
  imports: [MikroOrmModule.forRoot({ driver: PostgreSqlDriver, ...ormOptions })],
})
export class DbModule {}
