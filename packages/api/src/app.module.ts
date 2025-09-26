import { Module } from '@nestjs/common';
import { AuthenticationModule } from './presentation/rest/modules/authentication/authentication.module.js';
import { ProjectModule } from './presentation/rest/modules/project/project.module.js';

@Module({
  imports: [AuthenticationModule,ProjectModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
