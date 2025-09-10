import { Query } from "./cqrs/queries/query";
import { ApplicationMiddleware } from "./middleware/application-middleware";
import {
  QueryHandlerDependencies,
  QueryHandlerRegistry,
} from "./cqrs/registries/query-handler-registry";
import { Request } from "./cqrs/request";
import { QueryServices } from "@application/services/query-services";

export class QueryBus {
  private middlewares: ApplicationMiddleware<Request>[] = [];

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
    this.middlewares = [];
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- Handler factory returns dynamic type
    const handler = this.createHandler(query);
    const executeMiddlewareHandler = async (): Promise<TResponse> => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Dynamic handler execution
      return await handler.handle(query);
    };

    let next = executeMiddlewareHandler;
    for (let index: number = this.middlewares.length - 1; index >= 0; index--) {
      next = () => this.middlewares[index].handle(query, next);
    }
    return await next();
  }
}
