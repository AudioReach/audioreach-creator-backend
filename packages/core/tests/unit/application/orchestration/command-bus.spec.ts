import {CommandBus} from '@application/orchestration/command-bus';
import {CommandHandlerRegistry} from '@application/orchestration/cqrs/registries/command-handler-registry';
import {CommandHandlerNotFoundException} from '@application/orchestration/cqrs/exceptions/handler-not-found-exception';
import {AddModuleCommand} from '@application/usecase-designer';
import {TestCommand, UnknownCommand} from './helpers/test-commands';
import {
  createMockUnitOfWork,
  createMockCommandHandlerRegistry,
  createMockRegistryWithMissingHandler,
} from './helpers/mock-factories';

describe('CommandBus', () => {
  let mockUnitOfWork: any;
  let mockRegistry: any;
  let commandBus: CommandBus;

  beforeEach(() => {
    mockUnitOfWork = createMockUnitOfWork();
    mockRegistry = createMockCommandHandlerRegistry();
    commandBus = new CommandBus(mockUnitOfWork, mockRegistry);

    // Mock the middleware registration to avoid transaction middleware issues
    jest
      .spyOn(commandBus as any, 'registerMiddlewares')
      .mockImplementation(() => {
        (commandBus as any).middlewares = []; // Empty middleware array
      });

    // Re-initialize after mocking middleware registration
    (commandBus as any).registerMiddlewares();
  });

  describe('Command Execution', () => {
    it('should execute registered command successfully', async () => {
      // Given: A registered command
      const command = new TestCommand('test-data');

      // When: Executing the command
      const result = await commandBus.execute(command);

      // Then: Should return result from handler
      expect(result).toBe('mock-result');
      expect(mockRegistry.getCommandHandlerFactory).toHaveBeenCalledWith(
        command,
      );
    });

    it('should execute command with typed return value', async () => {
      // Given: Command with expected return type
      const command = new TestCommand('test-data');

      // When: Executing with type parameter
      const result = await commandBus.execute<string>(command);

      // Then: Should return typed result
      expect(result).toBe('mock-result');
      expect(typeof result).toBe('string');
    });

    it('should handle command execution with real registry', async () => {
      // Given: CommandBus with real registry (but mocked middleware)
      const realRegistry = CommandHandlerRegistry.Instance;
      const realCommandBus = new CommandBus(mockUnitOfWork, realRegistry);

      // Mock middleware for this instance too
      jest
        .spyOn(realCommandBus as any, 'registerMiddlewares')
        .mockImplementation(() => {
          (realCommandBus as any).middlewares = [];
        });
      (realCommandBus as any).registerMiddlewares();

      const command = new AddModuleCommand(1, 2, 3, 'test-module');

      // When: Executing real command
      const result = await realCommandBus.execute<number>(command);

      // Then: Should execute successfully
      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
    });
  });

  describe('Handler Resolution', () => {
    it('should resolve handler factory from registry', async () => {
      // Given: Command and mock registry
      const command = new TestCommand('test-data');

      // When: Executing command
      await commandBus.execute(command);

      // Then: Should call registry to get handler factory
      expect(mockRegistry.getCommandHandlerFactory).toHaveBeenCalledWith(
        command,
      );
      expect(mockRegistry.getCommandHandlerFactory).toHaveBeenCalledTimes(1);
    });

    it('should create handler with correct dependencies', async () => {
      // Given: Command
      const command = new TestCommand('test-data');

      // When: Executing command
      await commandBus.execute(command);

      // Then: Should create handler with UnitOfWork dependency
      const mockFactory =
        mockRegistry.getCommandHandlerFactory.mock.results[0].value;
      expect(mockFactory.create).toHaveBeenCalledWith({
        uow: mockUnitOfWork,
      });
    });

    it('should call handler with command', async () => {
      // Given: Command
      const command = new TestCommand('test-data');

      // When: Executing command
      await commandBus.execute(command);

      // Then: Should call handler with command
      const mockFactory =
        mockRegistry.getCommandHandlerFactory.mock.results[0].value;
      const mockHandler = mockFactory.create.mock.results[0].value;
      expect(mockHandler.handle).toHaveBeenCalledWith(command);
    });
  });

  describe('Error Handling', () => {
    it('should throw exception when handler not found', async () => {
      // Given: CommandBus with registry that throws exception
      const failingRegistry = createMockRegistryWithMissingHandler();
      const failingCommandBus = new CommandBus(mockUnitOfWork, failingRegistry);
      const unknownCommand = new UnknownCommand();

      // When/Then: Should throw CommandHandlerNotFoundException
      await expect(failingCommandBus.execute(unknownCommand)).rejects.toThrow(
        CommandHandlerNotFoundException,
      );
    });

    it('should propagate handler execution errors', async () => {
      // Given: Command and setup to make handler throw error
      const command = new TestCommand('test-data');
      const error = new Error('Handler execution failed');

      // Execute once to populate mock results, then modify the handler
      await commandBus.execute(command);
      const mockFactory =
        mockRegistry.getCommandHandlerFactory.mock.results[0].value;
      const mockHandler = mockFactory.create.mock.results[0].value;
      mockHandler.handle.mockRejectedValue(error);

      // When/Then: Should propagate the error on second execution
      await expect(commandBus.execute(command)).rejects.toThrow(
        'Handler execution failed',
      );
    });

    it('should handle null/undefined commands gracefully', async () => {
      // Given: Registry that properly handles null/undefined
      const strictRegistry = createMockCommandHandlerRegistry();
      strictRegistry.getCommandHandlerFactory.mockImplementation(command => {
        if (!command) {
          throw new Error('Command cannot be null or undefined');
        }
        return (
          strictRegistry.getCommandHandlerFactory.mock.results[0]?.value || {
            create: jest.fn().mockReturnValue({
              handle: jest.fn().mockResolvedValue('result'),
            }),
          }
        );
      });

      const strictCommandBus = new CommandBus(mockUnitOfWork, strictRegistry);
      jest
        .spyOn(strictCommandBus as any, 'registerMiddlewares')
        .mockImplementation(() => {
          (strictCommandBus as any).middlewares = [];
        });
      (strictCommandBus as any).registerMiddlewares();

      // When/Then: Should handle invalid input
      await expect(strictCommandBus.execute(null as any)).rejects.toThrow();
      await expect(
        strictCommandBus.execute(undefined as any),
      ).rejects.toThrow();
    });
  });

  describe('Integration with Real Components', () => {
    it('should handle real exception scenarios', async () => {
      // Given: Real registry and unregistered command
      const realRegistry = CommandHandlerRegistry.Instance;
      const realCommandBus = new CommandBus(mockUnitOfWork, realRegistry);
      const unknownCommand = new UnknownCommand();

      // When/Then: Should throw real exception
      await expect(realCommandBus.execute(unknownCommand)).rejects.toThrow(
        CommandHandlerNotFoundException,
      );
    });
  });
});
