import { Module } from '@nestjs/common';
import { AuthenticationModule } from './presentation/rest/modules/authentication/authentication.module.js';

@Module({
  imports: [AuthenticationModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
