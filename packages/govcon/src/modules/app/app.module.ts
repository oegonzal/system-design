import { Module } from '@nestjs/common';

import { DbModule } from '../database/db.module';

@Module({
  imports: [DbModule],
})
export class AppModule {}
