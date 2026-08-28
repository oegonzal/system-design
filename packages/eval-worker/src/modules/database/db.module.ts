import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PostgreSqlDriver } from '@mikro-orm/postgresql';
import { ormOptions } from '@sysdesign/db';

@Module({
  imports: [
    MikroOrmModule.forRoot({
      driver: PostgreSqlDriver,
      ...ormOptions,
      // No autoLoadEntities — see studio-api's DbModule for why.
    }),
  ],
})
export class DbModule {}
