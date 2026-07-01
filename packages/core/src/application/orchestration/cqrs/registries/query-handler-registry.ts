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
  }
}
