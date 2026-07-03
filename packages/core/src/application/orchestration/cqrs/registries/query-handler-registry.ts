/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {Query} from '../queries/query.js';
import type {QueryHandler} from '../queries/query-handler.js';
import type {FileSystemPort} from '../../../ports/file-system/file-system.port.js';
import type {WorkerPoolPort} from '../../../ports/worker/worker-pool.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import type {ProfilerPort} from '../../../ports/profiling/profiler.port.js';
import {GetModuleCompactHandler} from '../../../usecase-designer/spf-module/get/get-module-compact.handler.js';
import {GetModuleCompactQuery} from '../../../usecase-designer/spf-module/get/get-module-compact.query.js';
import {SpfModuleQueryHandler} from '../../../usecase-designer/spf-module/query/query-spf-modules.handler.js';
import {SpfModulesQuery} from '../../../usecase-designer/spf-module/query/query-spf-modules.query.js';
import {ContainerQueryHandler} from '../../../usecase-designer/container/query/query-containers.handler.js';
import {ContainerQuery} from '../../../usecase-designer/container/query/query-containers.query.js';
import {GetAllSpfModuleDefinitionsHandler} from '../../../definition/spf-module-definition/get-all/get-all-spf-module-definitions.handler.js';
import {GetAllSpfModuleDefinitionsQuery} from '../../../definition/spf-module-definition/get-all/get-all-spf-module-definitions.query.js';
import {GetSpfModuleDefinitionHandler} from '../../../definition/spf-module-definition/get-by-id/get-spf-module-definition.handler.js';
import {GetSpfModuleDefinitionQuery} from '../../../definition/spf-module-definition/get-by-id/get-spf-module-definition.query.js';
import {GetSpfCustomModuleMetadataHandler} from '../../../definition/spf-module-definition/get-custom-module-metadata/get-spf-custom-module-metadata.handler.js';
import {GetSpfCustomModuleMetadataQuery} from '../../../definition/spf-module-definition/get-custom-module-metadata/get-spf-custom-module-metadata.query.js';
import {GetAllDriverModuleDefinitionsHandler} from '../../../definition/driver-module-definition/get-all/get-all-driver-module-definitions.handler.js';
import {GetAllDriverModuleDefinitionsQuery} from '../../../definition/driver-module-definition/get-all/get-all-driver-module-definitions.query.js';
import {GetDriverModuleDefinitionHandler} from '../../../definition/driver-module-definition/get-by-id/get-driver-module-definition.handler.js';
import {GetDriverModuleDefinitionQuery} from '../../../definition/driver-module-definition/get-by-id/get-driver-module-definition.query.js';
import {GetAllUseCasesHandler} from '../../../usecase-designer/usecase/get-all/get-all-usecases.handler.js';
import {GetAllUseCasesQuery} from '../../../usecase-designer/usecase/get-all/get-all-usecases.query.js';
import {GetComponentsHandler} from '../../../usecase-designer/usecase/get-components/get-components.handler.js';
import {GetComponentsQuery} from '../../../usecase-designer/usecase/get-components/get-components.query.js';
import {QueryHandlerNotFoundException} from '../exceptions/handler-not-found-exception.js';
import {ValidateFileQuery} from '../../../validation/queries/validate-file.query.js';
import {ValidateFileQueryHandler} from '../../../validation/queries/validate-file.handler.js';
import {DownloadFileQuery} from '../../../file-operations/download-file/download-file.query.js';
import {DownloadFileHandler} from '../../../file-operations/download-file/download-file.handler.js';
import {ProjectFilePropertiesQuery} from '../../../project/project-file-properties.query.js';
import {ProjectFilePropertiesHandler} from '../../../project/project-file-properties.handler.js';
import {GetAllKeyDefinitionsQuery} from '../../../definition/key-definition/get-all/get-all-key-definitions.query.js';
import {GetAllKeyDefinitionsHandler} from '../../../definition/key-definition/get-all/get-all-key-definitions.handler.js';
import {GetKeyDefinitionQuery} from '../../../definition/key-definition/get-key/get-key-definition.query.js';
import {GetKeyDefinitionHandler} from '../../../definition/key-definition/get-key/get-key-definition.handler.js';
import {GetAllTagDefinitionsQuery} from '../../../definition/tag-definition/get-all/get-all-tag-definitions.query.js';
import {GetAllTagDefinitionsHandler} from '../../../definition/tag-definition/get-all/get-all-tag-definitions.handler.js';
import {GetTagDefinitionQuery} from '../../../definition/tag-definition/get-tag/get-tag-definition.query.js';
import {GetTagDefinitionHandler} from '../../../definition/tag-definition/get-tag/get-tag-definition.handler.js';
import {GetCkvCalibrationDataQuery} from '../../../usecase-designer/spf-module/get-cal-data/get-ckv-cal-data.query.js';
import {GetCkvCalibrationDataHandler} from '../../../usecase-designer/spf-module/get-cal-data/get-ckv-cal-data.handler.js';

export interface QueryHandlerDependencies {
  queryServices: QueryServices;
  fileSystem: FileSystemPort;
  workerPool?: WorkerPoolPort;
  logger?: Logger;
  profiler?: ProfilerPort;
}

export interface QueryHandlerFactory<THandler> {
  create(handlerDependencies: QueryHandlerDependencies): THandler;
}

export type QueryConstructor<T extends Query = Query> = new (
  ...arguments_: any[]
) => T;

export class QueryHandlerRegistry {
  private static instance: QueryHandlerRegistry;
  private queryHandlerFactories: Map<
    QueryConstructor,
    QueryHandlerFactory<QueryHandler<any, any>>
  > = new Map();

  public static get Instance(): QueryHandlerRegistry {
    if (!this.instance) {
      this.instance = new QueryHandlerRegistry();
    }
    return this.instance;
  }

  private constructor() {
    this.registerAllQueryHandlers();
  }

  public getQueryHandlerFactory(
    query: Query,
  ): QueryHandlerFactory<QueryHandler<any, any>> {
    const queryType = query.constructor as QueryConstructor<Query>;
    const handlerFactory = this.queryHandlerFactories.get(queryType);
    if (!handlerFactory)
      throw new QueryHandlerNotFoundException(queryType.name);
    return handlerFactory;
  }

  private registerAllQueryHandlers(): void {
    // To Do: Have separate registration files for each feature and register them here
    this.queryHandlerFactories.set(GetModuleCompactQuery, {
      create: (handlerDependencies: QueryHandlerDependencies) =>
        new GetModuleCompactHandler(handlerDependencies.queryServices),
    });

    this.queryHandlerFactories.set(SpfModulesQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new SpfModuleQueryHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(ContainerQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new ContainerQueryHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetAllSpfModuleDefinitionsQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetAllSpfModuleDefinitionsHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetSpfModuleDefinitionQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetSpfModuleDefinitionHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetSpfCustomModuleMetadataQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetSpfCustomModuleMetadataHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetAllDriverModuleDefinitionsQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetAllDriverModuleDefinitionsHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetDriverModuleDefinitionQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetDriverModuleDefinitionHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetAllUseCasesQuery, {
      create: (handlerDependencies: QueryHandlerDependencies) =>
        new GetAllUseCasesHandler(handlerDependencies.queryServices),
    });

    this.queryHandlerFactories.set(GetComponentsQuery, {
      create: (handlerDependencies: QueryHandlerDependencies) =>
        new GetComponentsHandler(handlerDependencies.queryServices),
    });

    this.queryHandlerFactories.set(ValidateFileQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new ValidateFileQueryHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(DownloadFileQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new DownloadFileHandler(
          deps.queryServices,
          deps.fileSystem,
          deps.workerPool,
          deps.logger,
          deps.profiler,
        ),
    });

    this.queryHandlerFactories.set(ProjectFilePropertiesQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new ProjectFilePropertiesHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetAllKeyDefinitionsQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetAllKeyDefinitionsHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetKeyDefinitionQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetKeyDefinitionHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetAllTagDefinitionsQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetAllTagDefinitionsHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetTagDefinitionQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetTagDefinitionHandler(deps.queryServices),
    });

    this.queryHandlerFactories.set(GetCkvCalibrationDataQuery, {
      create: (deps: QueryHandlerDependencies) =>
        new GetCkvCalibrationDataHandler(deps.queryServices, deps.logger),
    });
  }
}
