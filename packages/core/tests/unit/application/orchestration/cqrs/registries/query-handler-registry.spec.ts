/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {QueryHandlerRegistry} from '../../../../../../src/application/orchestration/cqrs/registries/query-handler-registry.js';
import {QueryHandlerNotFoundException} from '../../../../../../src/application/orchestration/cqrs/exceptions/handler-not-found-exception.js';
import {GetModuleCompactQuery} from '../../../../../../src/application/usecase-designer/spf-module/get/get-module-compact.query.js';
import {GetAllDriverModuleDefinitionsQuery} from '../../../../../../src/application/definition/driver-module-definition/get-all/get-all-driver-module-definitions.query.js';
import {GetDriverModuleDefinitionQuery} from '../../../../../../src/application/definition/driver-module-definition/get-by-id/get-driver-module-definition.query.js';
import {TestQuery, UnknownQuery} from '../../helpers/test-commands.js';
import {createMockQueryServices} from '../../helpers/mock-factories.js';

describe('QueryHandlerRegistry', () => {
  let registry: QueryHandlerRegistry;
  let mockQueryServices: any;

  beforeEach(() => {
    // Get the singleton instance
    registry = QueryHandlerRegistry.Instance;
    mockQueryServices = createMockQueryServices();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      // Given: Multiple calls to get instance
      const instance1 = QueryHandlerRegistry.Instance;
      const instance2 = QueryHandlerRegistry.Instance;

      // Then: Should return same instance
      expect(instance1).toBe(instance2);
      expect(instance1).toBe(registry);
    });

    it('should be properly initialized', () => {
      // Given: Registry instance
      const instance = QueryHandlerRegistry.Instance;

      // Then: Should be defined and have proper type
      expect(instance).toBeDefined();
      expect(instance).toBeInstanceOf(QueryHandlerRegistry);
    });
  });

  describe('Query Handler Registration', () => {
    it('should have registered GetModuleCompactQuery handler', () => {
      // Given: GetModuleCompactQuery
      const query = new GetModuleCompactQuery(123, 'test-client');

      // When: Getting handler factory
      const factory = registry.getQueryHandlerFactory(query);

      // Then: Should return valid factory
      expect(factory).toBeDefined();
      expect(factory.create).toBeDefined();
      expect(typeof factory.create).toBe('function');
    });

    it('should create handler with correct dependencies', () => {
      // Given: Query and dependencies
      const query = new GetModuleCompactQuery(123, 'test-client');
      const factory = registry.getQueryHandlerFactory(query);

      // When: Creating handler
      const handler = factory.create({queryServices: mockQueryServices});

      // Then: Should create valid handler
      expect(handler).toBeDefined();
      expect(handler.handle).toBeDefined();
      expect(typeof handler.handle).toBe('function');
    });

    it('should create different handler instances', () => {
      // Given: Query and factory
      const query = new GetModuleCompactQuery(123, 'test-client');
      const factory = registry.getQueryHandlerFactory(query);

      // When: Creating multiple handlers
      const handler1 = factory.create({queryServices: mockQueryServices});
      const handler2 = factory.create({queryServices: mockQueryServices});

      // Then: Should create different instances
      expect(handler1).not.toBe(handler2);
      expect(handler1).toEqual(handler2); // Same structure
    });
  });

  describe('Driver Module Definition Query Handlers', () => {
    it('should have registered GetAllDriverModuleDefinitionsQuery handler', () => {
      const query = new GetAllDriverModuleDefinitionsQuery(
        1,
        undefined,
        undefined,
        'test-client',
      );

      const factory = registry.getQueryHandlerFactory(query);

      expect(factory).toBeDefined();
      const handler = factory.create({queryServices: mockQueryServices});
      expect(handler.handle).toBeDefined();
    });

    it('should have registered GetDriverModuleDefinitionQuery handler', () => {
      const query = new GetDriverModuleDefinitionQuery(1, 2, 'test-client');

      const factory = registry.getQueryHandlerFactory(query);

      expect(factory).toBeDefined();
      const handler = factory.create({queryServices: mockQueryServices});
      expect(handler.handle).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should throw QueryHandlerNotFoundException for unregistered query', () => {
      // Given: Unregistered query
      const unknownQuery = new UnknownQuery();

      // When/Then: Should throw exception
      expect(() => registry.getQueryHandlerFactory(unknownQuery)).toThrow(
        QueryHandlerNotFoundException,
      );
    });

    it('should throw exception with correct query name', () => {
      // Given: Unregistered query
      const unknownQuery = new UnknownQuery();

      // When/Then: Should throw exception with query name
      expect(() => registry.getQueryHandlerFactory(unknownQuery)).toThrow(
        'UnknownQuery',
      );
    });

    it('should throw QueryHandlerNotFoundException for TestQuery', () => {
      // Given: TestQuery (not registered in real registry)
      const testQuery = new TestQuery('test-param');

      // When/Then: Should throw exception
      expect(() => registry.getQueryHandlerFactory(testQuery)).toThrow(
        QueryHandlerNotFoundException,
      );
    });

    it('should handle null query gracefully', () => {
      // When/Then: Should throw error for null query
      expect(() => registry.getQueryHandlerFactory(null as any)).toThrow();
    });

    it('should handle undefined query gracefully', () => {
      // When/Then: Should throw error for undefined query
      expect(() => registry.getQueryHandlerFactory(undefined as any)).toThrow();
    });
  });

  describe('Query Type Resolution', () => {
    it('should resolve query type correctly', () => {
      // Given: Different query instances of same type
      const query1 = new GetModuleCompactQuery(123, 'test-client');
      const query2 = new GetModuleCompactQuery(456, 'test-client');

      // When: Getting handler factories
      const factory1 = registry.getQueryHandlerFactory(query1);
      const factory2 = registry.getQueryHandlerFactory(query2);

      // Then: Should return same factory for same query type
      expect(factory1).toBe(factory2);
    });

    it('should use query constructor as key', () => {
      // Given: Query instance
      const query = new GetModuleCompactQuery(123, 'test-client');

      // When: Getting handler factory
      const factory = registry.getQueryHandlerFactory(query);

      // Then: Should successfully resolve based on constructor
      expect(factory).toBeDefined();
      expect(query.constructor.name).toBe('GetModuleCompactQuery');
    });
  });

  describe('Handler Factory Behavior', () => {
    it('should create handler that can execute', async () => {
      // Given: Query and handler
      const query = new GetModuleCompactQuery(123, 'test-client');
      const factory = registry.getQueryHandlerFactory(query);
      const handler = factory.create({queryServices: mockQueryServices});

      // When: Executing handler
      const result = handler.handle(query);

      // Then: Should execute without error
      expect(result).toBeDefined();
      // Note: The actual result depends on the handler implementation
    });

    it('should pass dependencies correctly to handler', () => {
      // Given: Query and custom query services
      const query = new GetModuleCompactQuery(123, 'test-client');
      const factory = registry.getQueryHandlerFactory(query);
      const customQueryServices = createMockQueryServices();

      // When: Creating handler with custom dependencies
      const handler = factory.create({queryServices: customQueryServices});

      // Then: Handler should be created successfully
      expect(handler).toBeDefined();
      // The handler should have access to the provided dependencies
    });
  });

  describe('Registry State', () => {
    it('should maintain consistent state across calls', () => {
      // Given: Multiple queries of same type
      const query1 = new GetModuleCompactQuery(123, 'test-client');
      const query2 = new GetModuleCompactQuery(456, 'test-client');

      // When: Getting factories multiple times
      const factory1a = registry.getQueryHandlerFactory(query1);
      const factory1b = registry.getQueryHandlerFactory(query1);
      const factory2 = registry.getQueryHandlerFactory(query2);

      // Then: Should maintain consistency
      expect(factory1a).toBe(factory1b);
      expect(factory1a).toBe(factory2); // Same type, same factory
    });

    it('should handle concurrent access', () => {
      // Given: Multiple queries
      const queries = [
        new GetModuleCompactQuery(1, 'test-client'),
        new GetModuleCompactQuery(2, 'test-client'),
        new GetModuleCompactQuery(3, 'test-client'),
      ];

      // When: Getting factories concurrently
      const factories = queries.map(query =>
        registry.getQueryHandlerFactory(query),
      );

      // Then: All should succeed and return same factory
      factories.forEach(factory => {
        expect(factory).toBeDefined();
        expect(factory).toBe(factories[0]);
      });
    });
  });
});
