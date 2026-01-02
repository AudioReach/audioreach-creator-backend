import {Module} from '@nestjs/common';
import type {NestModule, MiddlewareConsumer} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {AuthenticationModule} from './presentation/rest/modules/authentication/authentication.module.js';
import {UseCaseModule} from './presentation/rest/modules/usecase/usecase.module.js';
import {ModuleInstanceModule} from './presentation/rest/modules/module-instance/module-instance.module.js';
import {SubgraphModule} from './presentation/rest/modules/subgraph/subgraph.module.js';
import {SubsystemModule} from './presentation/rest/modules/subsystem/subsystem.module.js';
import {ContainerModule} from './presentation/rest/modules/container/container.module.js';
import {DataLinkModule} from './presentation/rest/modules/data-link/data-link.module.js';
import {ControlLinkModule} from './presentation/rest/modules/control-link/control-link.module.js';
import {ProjectModule} from './presentation/rest/modules/project/project.module.js';
import {ArcCqrsModule} from './infrastructure-wrapper/arc-cqrs.module.js';
import {KeyDefinitionModule} from './presentation/rest/modules/definition/key-definition/key-definition.module.js';
import {PropertyDefinitionModule} from './presentation/rest/modules/definition/property-definition/property-definition.module.js';
import {ModuleDefinitionModule} from './presentation/rest/modules/definition/module-definition/module-definition.module.js';
import {RequestLoggerMiddleware} from './infrastructure-wrapper/middleware/request-logger.middleware.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ArcCqrsModule,
    AuthenticationModule,
    ProjectModule,
    KeyDefinitionModule,
    PropertyDefinitionModule,
    ModuleDefinitionModule,
    UseCaseModule,
    ModuleInstanceModule,
    SubgraphModule,
    SubsystemModule,
    ContainerModule,
    DataLinkModule,
    ControlLinkModule,
  ],

  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggerMiddleware).forRoutes('*');
  }
}
