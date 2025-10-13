import type {UnitOfWork} from '../../../shared/repository/unit-of-work.js';
import type {Command} from '../cqrs/commands/command.js';
import type {ApplicationMiddleware} from './application-middleware.js';

export class TransactionMiddleware implements ApplicationMiddleware<Command> {
  constructor(private uow: UnitOfWork) {}

  async handle<TResponse>(
    _request: Command,
    next: () => Promise<TResponse>,
  ): Promise<TResponse> {
    return await this.uow.executeInTransaction(async () => {
      return await next();
    });
  }
}
