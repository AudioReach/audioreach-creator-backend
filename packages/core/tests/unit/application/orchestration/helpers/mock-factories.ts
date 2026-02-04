import {jest} from '@jest/globals';
import {UnitOfWork} from '../../../../../src/application/ports/persistence/unit-of-work.js';
import {QueryServices} from '../../../../../src/application/services/query-services.js';
import {CommandHandlerRegistry} from '../../../../../src/application/orchestration/cqrs/registries/command-handler-registry.js';
import {QueryHandlerRegistry} from '../../../../../src/application/orchestration/cqrs/registries/query-handler-registry.js';
import {CommandHandler} from '../../../../../src/application/orchestration/cqrs/commands/command-handler.js';
import {QueryHandler} from '../../../../../src/application/orchestration/cqrs/queries/query-handler.js';
import {
  CommandHandlerNotFoundException,
  QueryHandlerNotFoundException,
} from '../../../../../src/application/orchestration/cqrs/exceptions/handler-not-found-exception.js';

/**
 * Mock UnitOfWork for testing command handlers and transaction middleware
 */
export const createMockUnitOfWork = (): jest.Mocked<UnitOfWork> => {
  return {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    isInTransaction: jest.fn().mockReturnValue(false),
    getRepository: jest.fn(),
  } as any;
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
  useCaseQueryService: {} as any,
  projectQueryService: {} as any,
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
