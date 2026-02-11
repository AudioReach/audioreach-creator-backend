/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Query} from './cqrs/queries/query.js';
//import type {ApplicationMiddleware} from './middleware/application-middleware.js';
import {
  type QueryHandlerDependencies,
  QueryHandlerRegistry,
} from './cqrs/registries/query-handler-registry.js';
//import type {Request} from './cqrs/request.js';
import type {QueryServices} from '../services/query-services.js';

export class QueryBus {
  //private middlewares: ApplicationMiddleware<Request>[] = [];

  constructor(
    private queryServices: QueryServices,
    private handlerRegistry: QueryHandlerRegistry,
  ) {
    this.registerMiddlewares();
  }

  private registerMiddlewares(): void {
    // Add middleware here..
    // 1. Logging middleware (can be added later)
    // 2. Any common validations
    // Note: Transaction middleware is NOT used for queries
    //this.middlewares = [];
  }

  async execute<TResponse = any>(query: Query): Promise<TResponse> {
    return await this.executeMiddlewarePipeline(query);
  }

  private createHandler(query: Query): any {
    const factory = this.handlerRegistry.getQueryHandlerFactory(query);
    const dependencies: QueryHandlerDependencies = {
      queryServices: this.queryServices,
    };
    return factory.create(dependencies);
  }

  async executeMiddlewarePipeline<TResponse>(query: Query): Promise<TResponse> {
    const handler = this.createHandler(query);
    return await handler.handle(query);
    /*
    const executeMiddlewareHandler = async (): Promise<TResponse> => {
      return await handler.handle(query);
    };

    let next = executeMiddlewareHandler;
    for (let index: number = this.middlewares.length - 1; index >= 0; index--) {
      next = () => this.middlewares[index].handle(query, next);
    }
    return await next();*/
  }
}
