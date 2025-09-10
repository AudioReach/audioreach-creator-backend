import { Request } from "../cqrs/request";
/*
 * Basic interface all behaviors that are called before commands/queries are executed
 */
export interface ApplicationMiddleware<T extends Request> {
  handle<TResponse>(
    request: T,
    next: () => Promise<TResponse>,
  ): Promise<TResponse>;
}
