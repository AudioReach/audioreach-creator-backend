import {QueryServices} from '../../../services/query-services.js';
import {Query} from '../queries/query.js';
import {QueryHandler} from '../queries/query-handler.js';
import {GetModuleCompactHandler} from '../../../usecase-designer/spf-module/get/get-module-compact.handler.js';
import {GetModuleCompactQuery} from '../../../usecase-designer/spf-module/get/get-module-compact.query.js';
import {QueryHandlerNotFoundException} from '../exceptions/handler-not-found-exception.js';

export interface QueryHandlerDependencies {
  queryServices: QueryServices;
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
  }
}
