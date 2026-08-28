import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ormOptions } from '@sysdesign/db';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      driver: PostgreSqlDriver,
      ...ormOptions,
      // No autoLoadEntities: ormOptions already lists every entity, and
      // combining the two registers each entity twice — which surfaces as
      // "Duplicate table names are not allowed" only in the bundled build.
    }),
  ],
})
export class DbModule {}
