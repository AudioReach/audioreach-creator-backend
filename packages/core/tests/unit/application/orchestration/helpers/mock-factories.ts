import {UnitOfWork} from '@shared/repository/unit-of-work';
import {QueryServices} from '@application/services/query-services';
import {CommandHandlerRegistry} from '@application/orchestration/cqrs/registries/command-handler-registry';
import {QueryHandlerRegistry} from '@application/orchestration/cqrs/registries/query-handler-registry';
import {CommandHandler} from '@application/orchestration/cqrs/commands/command-handler';
import {QueryHandler} from '@application/orchestration/cqrs/queries/query-handler';
import {
  CommandHandlerNotFoundException,
  QueryHandlerNotFoundException,
} from '@application/orchestration/cqrs/exceptions/handler-not-found-exception';

/**
 * Mock UnitOfWork for testing command handlers and transaction middleware
 */
export const createMockUnitOfWork = (): jest.Mocked<UnitOfWork> => {
  // Create a fresh mock function each time to avoid Jest mock state corruption
  const mockExecuteInTransaction = jest.fn();

  // Use a simple implementation that doesn't cause recursion
  mockExecuteInTransaction.mockImplementation(
    async <T>(task: () => Promise<T>): Promise<T> => {
      try {
        return await task();
      } catch (error) {
        throw error;
      }
    },
  );

  return {
    executeInTransaction: mockExecuteInTransaction,
  };
};

/**
 * Mock QueryServices for testing query handlers
 */
export const createMockQueryServices = (): jest.Mocked<QueryServices> => ({
  modulesQueryService: {
    getModuleCompact: jest.fn().mockResolvedValue({
      id: 'mock-module-id',
      name: 'Mock Module',
    }),
  } as any,
});

/**
 * Mock CommandHandlerRegistry for testing CommandBus
 */
export const createMockCommandHandlerRegistry =
  (): jest.Mocked<CommandHandlerRegistry> => {
    const mockHandler: jest.Mocked<CommandHandler<any, any>> = {
      handle: jest.fn().mockResolvedValue('mock-result'),
    };

    const mockFactory = {
      create: jest.fn().mockReturnValue(mockHandler),
    };

    return {
      getCommandHandlerFactory: jest.fn().mockReturnValue(mockFactory),
    } as any;
  };

/**
 * Mock QueryHandlerRegistry for testing QueryBus
 */
export const createMockQueryHandlerRegistry =
  (): jest.Mocked<QueryHandlerRegistry> => {
    const mockHandler: jest.Mocked<QueryHandler<any, any>> = {
      handle: jest.fn().mockResolvedValue('mock-query-result'),
    };

    const mockFactory = {
      create: jest.fn().mockReturnValue(mockHandler),
    };

    return {
      getQueryHandlerFactory: jest.fn().mockReturnValue(mockFactory),
    } as any;
  };

/**
 * Mock CommandHandlerRegistry that throws HandlerNotFoundException
 */
export const createMockRegistryWithMissingHandler =
  (): jest.Mocked<CommandHandlerRegistry> => {
    return {
      getCommandHandlerFactory: jest.fn().mockImplementation(() => {
        throw new CommandHandlerNotFoundException('UnknownCommand');
      }),
    } as any;
  };

/**
 * Mock QueryHandlerRegistry that throws HandlerNotFoundException
 */
export const createMockQueryRegistryWithMissingHandler =
  (): jest.Mocked<QueryHandlerRegistry> => {
    return {
      getQueryHandlerFactory: jest.fn().mockImplementation(() => {
        throw new QueryHandlerNotFoundException('UnknownQuery');
      }),
    } as any;
  };
