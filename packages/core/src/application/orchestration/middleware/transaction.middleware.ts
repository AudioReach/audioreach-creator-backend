import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {Command} from '../cqrs/commands/command.js';
import {TransactionScope} from '../cqrs/commands/command.js';
import type {ApplicationMiddleware} from './application-middleware.js';

export class TransactionMiddleware implements ApplicationMiddleware<Command> {
  constructor(private uow: UnitOfWork) {}

  async handle<TResponse>(
    request: Command,
    next: () => Promise<TResponse>,
  ): Promise<TResponse> {
    const scope = request.transactionScope ?? TransactionScope.Required;

    if (scope === 'none') {
      return await next();
    }

    if (this.uow == undefined) {
      //TODO: added for compilation, remove later once executeInTransaction() is fixed.
    }

    return await next();
    // return await this.uow.executeInTransaction(async () => {
    //   return await next();
    // });
  }
}
