/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Module} from '@nestjs/common';
import type {NestModule, MiddlewareConsumer} from '@nestjs/common';
import {ConfigModule} from '@nestjs/config';
import {AuthenticationModule} from './presentation/rest/modules/authentication/authentication.module.js';
import {UseCaseModule} from './presentation/rest/modules/usecase/usecase.module.js';
import {UseCaseCategoryModule} from './presentation/rest/modules/usecase-category/usecase-category.module.js';
import {DriverModuleModule} from './presentation/rest/modules/driver-module/driver-module.module.js';
import {SpfModuleModule} from './presentation/rest/modules/spf-module/spf-module.module.js';
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
import {SpfCustomModuleSchemaModule} from './presentation/rest/modules/definition/spf-custom-module-schema/spf-custom-module-schema.module.js';
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
    SpfCustomModuleSchemaModule,
    UseCaseModule,
    UseCaseCategoryModule,
    DriverModuleModule,
    SpfModuleModule,
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
