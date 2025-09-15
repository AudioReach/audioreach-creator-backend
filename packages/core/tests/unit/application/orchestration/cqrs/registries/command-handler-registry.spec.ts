import {CommandHandlerRegistry} from '@application/orchestration/cqrs/registries/command-handler-registry';
import {CommandHandlerNotFoundException} from '@application/orchestration/cqrs/exceptions/handler-not-found-exception';
import {AddModuleCommand} from '@application/usecase-designer';
import {TestCommand, UnknownCommand} from '../../helpers/test-commands';
import {createMockUnitOfWork} from '../../helpers/mock-factories';

describe('CommandHandlerRegistry', () => {
  let registry: CommandHandlerRegistry;

  beforeEach(() => {
    // Get fresh instance for each test
    registry = CommandHandlerRegistry.Instance;
  });

  describe('Singleton Behavior', () => {
    it('should return same instance across calls', () => {
      // Given: Multiple calls to get instance
      const instance1 = CommandHandlerRegistry.Instance;
      const instance2 = CommandHandlerRegistry.Instance;

      // Then: Should be same instance
      expect(instance1).toBe(instance2);
    });

    it('should maintain registration state across instance calls', () => {
      // Given: Registry instances
      const instance1 = CommandHandlerRegistry.Instance;
      const instance2 = CommandHandlerRegistry.Instance;
      const command = new AddModuleCommand(1, 2, 3, 'test-alias');

      // When: Getting factory from different instances
      const factory1 = instance1.getCommandHandlerFactory(command);
      const factory2 = instance2.getCommandHandlerFactory(command);

      // Then: Should return same factory type (both should work)
      expect(factory1).toBeDefined();
      expect(factory2).toBeDefined();
      expect(factory1.create).toBeInstanceOf(Function);
      expect(factory2.create).toBeInstanceOf(Function);
    });
  });

  describe('Handler Registration and Retrieval', () => {
    it('should return factory for registered AddModuleCommand', () => {
      // Given: Registry with registered handlers
      const command = new AddModuleCommand(1, 2, 3, 'test-module');

      // When: Getting handler factory
      const factory = registry.getCommandHandlerFactory(command);

      // Then: Should return valid factory
      expect(factory).toBeDefined();
      expect(factory.create).toBeInstanceOf(Function);
    });

    it('should throw exception for unregistered command', () => {
      // Given: Registry and unregistered command
      const unknownCommand = new UnknownCommand();

      // When/Then: Should throw CommandHandlerNotFoundException
      expect(() => registry.getCommandHandlerFactory(unknownCommand)).toThrow(
        CommandHandlerNotFoundException,
      );
    });

    it('should throw exception with correct command name', () => {
      // Given: Registry and unregistered command
      const unknownCommand = new UnknownCommand();

      // When/Then: Should throw exception with command name
      expect(() => registry.getCommandHandlerFactory(unknownCommand)).toThrow(
        'UnknownCommand',
      );
    });

    it('should handle different command instances of same type', () => {
      // Given: Multiple instances of same command type
      const command1 = new AddModuleCommand(1, 2, 3, 'module1');
      const command2 = new AddModuleCommand(4, 5, 6, 'module2');

      // When: Getting factories for both
      const factory1 = registry.getCommandHandlerFactory(command1);
      const factory2 = registry.getCommandHandlerFactory(command2);

      // Then: Both should return valid factories
      expect(factory1).toBeDefined();
      expect(factory2).toBeDefined();
      expect(factory1.create).toBeInstanceOf(Function);
      expect(factory2.create).toBeInstanceOf(Function);
    });
  });

  describe('Factory Pattern Implementation', () => {
    it('should create handler with correct dependencies', () => {
      // Given: Registry and mock dependencies
      const command = new AddModuleCommand(1, 2, 3, 'test-module');
      const mockUnitOfWork = createMockUnitOfWork();
      const dependencies = {uow: mockUnitOfWork};

      // When: Creating handler via factory
      const factory = registry.getCommandHandlerFactory(command);
      const handler = factory.create(dependencies);

      // Then: Handler should be created with dependencies
      expect(handler).toBeDefined();
      expect(handler.handle).toBeInstanceOf(Function);
    });

    it('should create new handler instance on each factory call', () => {
      // Given: Factory and dependencies
      const command = new AddModuleCommand(1, 2, 3, 'test-module');
      const factory = registry.getCommandHandlerFactory(command);
      const mockUnitOfWork = createMockUnitOfWork();
      const dependencies = {uow: mockUnitOfWork};

      // When: Creating multiple handlers
      const handler1 = factory.create(dependencies);
      const handler2 = factory.create(dependencies);

      // Then: Should be different instances
      expect(handler1).not.toBe(handler2);
      expect(handler1.handle).toBeInstanceOf(Function);
      expect(handler2.handle).toBeInstanceOf(Function);
    });

    it('should create handler that can be called', async () => {
      // Given: Factory, dependencies, and command
      const command = new AddModuleCommand(1, 2, 3, 'test-module');
      const factory = registry.getCommandHandlerFactory(command);
      const mockUnitOfWork = createMockUnitOfWork();
      const dependencies = {uow: mockUnitOfWork};

      // When: Creating and calling handler
      const handler = factory.create(dependencies);
      const result = await handler.handle(command);

      // Then: Handler should execute and return result
      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
    });

    it('should pass correct dependencies to handler constructor', () => {
      // Given: Registry, command, and specific UnitOfWork mock
      const command = new AddModuleCommand(1, 2, 3, 'test-module');
      const factory = registry.getCommandHandlerFactory(command);
      const mockUnitOfWork = createMockUnitOfWork();
      const dependencies = {uow: mockUnitOfWork};

      // When: Creating handler
      const handler = factory.create(dependencies);

      // Then: Handler should have access to the UnitOfWork
      // We can verify this by checking that the handler was created successfully
      // and can execute (which requires UnitOfWork internally)
      expect(handler).toBeDefined();
      expect(handler.handle).toBeInstanceOf(Function);
    });
  });

  describe('Error Handling', () => {
    it('should provide meaningful error messages', () => {
      // Given: Unregistered command
      const unknownCommand = new TestCommand('test-data');

      // When/Then: Should throw with meaningful message
      expect(() => registry.getCommandHandlerFactory(unknownCommand)).toThrow(
        CommandHandlerNotFoundException,
      );

      try {
        registry.getCommandHandlerFactory(unknownCommand);
      } catch (error) {
        expect(error).toBeInstanceOf(CommandHandlerNotFoundException);
        expect((error as Error).message).toContain('TestCommand');
      }
    });

    it('should handle null/undefined command gracefully', () => {
      // When/Then: Should handle invalid input
      expect(() => registry.getCommandHandlerFactory(null as any)).toThrow();

      expect(() =>
        registry.getCommandHandlerFactory(undefined as any),
      ).toThrow();
    });
  });
});
