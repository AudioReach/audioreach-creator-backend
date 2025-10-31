import type {Command} from './cqrs/commands/command.js';
import type {ApplicationMiddleware} from './middleware/application-middleware.js';
import {CommandHandlerRegistry} from './cqrs/registries/command-handler-registry.js';
import type {CommandHandlerDependencies} from './cqrs/registries/command-handler-registry.js';
import type {UnitOfWork} from '../ports/persistence/unit-of-work.js';
import type {Request} from './cqrs/request.js';
import {TransactionMiddleware} from './middleware/transaction.middleware.js';
import type {FileReaderPort} from '../../application/file-operations/open-file/file-reader.port.js';

export class CommandBus {
  private middlewares: ApplicationMiddleware<Request>[] = [];

  constructor(
    private unitOfWork: UnitOfWork,
    private handlerRegistry: CommandHandlerRegistry,
    private fileReader: FileReaderPort,
  ) {
    this.registerMiddlewares();
  }

  private registerMiddlewares(): void {
    // Add middleware here..
    // 1. Logging middleware
    // 2. Any common validations
    this.middlewares = [new TransactionMiddleware(this.unitOfWork)];
  }

  async execute<TResponse = void>(command: Command): Promise<TResponse> {
    return await this.executeMiddlewarePipeline(command);
  }

  private createHandler(command: Command): any {
    const factory = this.handlerRegistry.getCommandHandlerFactory(command);
    const dependencies: CommandHandlerDependencies = {
      uow: this.unitOfWork,
      fileReader: this.fileReader,
    };
    return factory.create(dependencies);
  }

  async executeMiddlewarePipeline<TResponse>(
    command: Command,
  ): Promise<TResponse> {
    const handler = this.createHandler(command);
    const executeMiddlewareHandler = async (): Promise<TResponse> => {
      return await handler.handle(command);
    };

    let next = executeMiddlewareHandler;
    for (let index: number = this.middlewares.length - 1; index >= 0; index--) {
      next = () => this.middlewares[index].handle(command, next);
    }
    return await next();
  }
}
