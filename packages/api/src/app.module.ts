import {Module} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {AuthenticationModule} from './presentation/rest/modules/authentication/authentication.module.js';
import {ProjectModule} from './presentation/rest/modules/project/project.module.js';
import {ArcCqrsModule} from './infrastructure-wrapper/arc-cqrs.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ArcCqrsModule,
    AuthenticationModule,
    ProjectModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
