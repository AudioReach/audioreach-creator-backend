import { UnitOfWork } from "@shared/repository/unit-of-work";
import { Command } from "../cqrs/commands/command";
import { ApplicationMiddleware } from "./application-middleware";

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
