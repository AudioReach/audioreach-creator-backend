/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Query} from './cqrs/queries/query.js';
import {
  type QueryHandlerDependencies,
  QueryHandlerRegistry,
} from './cqrs/registries/query-handler-registry.js';
import type {QueryServices} from '../services/query-services.js';
import type {FileSystemPort} from './../ports/file-system/file-system.port.js';
export class QueryBus {
  constructor(
    private queryServices: QueryServices,
    private handlerRegistry: QueryHandlerRegistry,
    private readonly fileSystem: FileSystemPort,
  ) {}

  async execute<TResponse = any>(query: Query): Promise<TResponse> {
    const handler = this.createHandler(query);
    return await handler.handle(query);
  }

  private createHandler(query: Query): any {
    const factory = this.handlerRegistry.getQueryHandlerFactory(query);
    const dependencies: QueryHandlerDependencies = {
      queryServices: this.queryServices,
      fileSystem: this.fileSystem,
    };
    return factory.create(dependencies);
  }
}
