import { Query } from "./query";

/**
 * Represents a query handler.
 * query handlers are used to execute queries.
 *
 * @publicApi
 */
export interface QueryHandler<TQuery extends Query, TResponse> {
  handle(query: TQuery): TResponse;
}
