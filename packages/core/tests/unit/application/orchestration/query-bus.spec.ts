/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {QueryBus} from '../../../../src/application/orchestration/query-bus.js';
import {QueryHandlerRegistry} from '../../../../src/application/orchestration/cqrs/registries/query-handler-registry.js';
import {QueryHandlerNotFoundException} from '../../../../src/application/orchestration/cqrs/exceptions/handler-not-found-exception.js';
import {GetModuleCompactQuery} from '../../../../src/application/usecase-designer/spf-module/get/get-module-compact.query.js';
import {TestQuery, UnknownQuery} from './helpers/test-commands.js';
import {
  createMockQueryServices,
  createMockQueryHandlerRegistry,
  createMockQueryRegistryWithMissingHandler,
} from './helpers/mock-factories.js';

describe('QueryBus', () => {
  let mockQueryServices: any;
  let mockRegistry: any;
  let queryBus: QueryBus;

  beforeEach(() => {
    mockQueryServices = createMockQueryServices();
    mockRegistry = createMockQueryHandlerRegistry();
    queryBus = new QueryBus(mockQueryServices, mockRegistry);
  });

  describe('Query Execution', () => {
    it('should execute registered query successfully', async () => {
      // Given: A registered query
      const query = new TestQuery('test-param');

      // When: Executing the query
      const result = await queryBus.execute(query);

      // Then: Should return result from handler
      expect(result).toBe('mock-query-result');
      expect(mockRegistry.getQueryHandlerFactory).toHaveBeenCalledWith(query);
    });

    it('should execute query with typed return value', async () => {
      // Given: Query with expected return type
      const query = new TestQuery('test-param');

      // When: Executing with type parameter
      const result = await queryBus.execute<string>(query);

      // Then: Should return typed result
      expect(result).toBe('mock-query-result');
      expect(typeof result).toBe('string');
    });

    it('should handle query execution with real registry', async () => {
      // Given: QueryBus with real registry
      const realRegistry = QueryHandlerRegistry.Instance;
      const realQueryBus = new QueryBus(mockQueryServices, realRegistry);

      const query = new GetModuleCompactQuery(123, 'test-client');

      // When: Executing real query
      const result = await realQueryBus.execute(query);

      // Then: Should execute successfully
      expect(result).toBeDefined();
      expect(result).toEqual({
        systemId: -1,
        name: 'Placeholder Module',
        alias: 'placeholder',
        isEnabled: false,
      });
    });
  });

  describe('Handler Resolution', () => {
    it('should resolve handler factory from registry', async () => {
      // Given: Query and mock registry
      const query = new TestQuery('test-param');

      // When: Executing query
      await queryBus.execute(query);

      // Then: Should call registry to get handler factory
      expect(mockRegistry.getQueryHandlerFactory).toHaveBeenCalledWith(query);
      expect(mockRegistry.getQueryHandlerFactory).toHaveBeenCalledTimes(1);
    });

    it('should create handler with correct dependencies', async () => {
      // Given: Query
      const query = new TestQuery('test-param');

      // When: Executing query
      await queryBus.execute(query);

      // Then: Should create handler with QueryServices dependency
      const mockFactory =
        mockRegistry.getQueryHandlerFactory.mock.results[0].value;
      expect(mockFactory.create).toHaveBeenCalledWith({
        queryServices: mockQueryServices,
      });
    });

    it('should call handler with query', async () => {
      // Given: Query
      const query = new TestQuery('test-param');

      // When: Executing query
      await queryBus.execute(query);

      // Then: Should call handler with query
      const mockFactory =
        mockRegistry.getQueryHandlerFactory.mock.results[0].value;
      const mockHandler = mockFactory.create.mock.results[0].value;
      expect(mockHandler.handle).toHaveBeenCalledWith(query);
    });
  });

  describe('Error Handling', () => {
    it('should throw exception when handler not found', async () => {
      // Given: QueryBus with registry that throws exception
      const failingRegistry = createMockQueryRegistryWithMissingHandler();
      const failingQueryBus = new QueryBus(mockQueryServices, failingRegistry);
      const unknownQuery = new UnknownQuery();

      // When/Then: Should throw QueryHandlerNotFoundException
      await expect(failingQueryBus.execute(unknownQuery)).rejects.toThrow(
        QueryHandlerNotFoundException,
      );
    });

    it('should propagate handler execution errors', async () => {
      // Given: Query and setup to make handler throw error
      const query = new TestQuery('test-param');
      const error = new Error('Handler execution failed');

      // Execute once to populate mock results, then modify the handler
      await queryBus.execute(query);
      const mockFactory =
        mockRegistry.getQueryHandlerFactory.mock.results[0].value;
      const mockHandler = mockFactory.create.mock.results[0].value;
      mockHandler.handle.mockRejectedValue(error);

      // When/Then: Should propagate the error on second execution
      await expect(queryBus.execute(query)).rejects.toThrow(
        'Handler execution failed',
      );
    });

    it('should handle null/undefined queries gracefully', async () => {
      // Given: Registry that properly handles null/undefined
      const strictRegistry = createMockQueryHandlerRegistry();
      strictRegistry.getQueryHandlerFactory.mockImplementation(query => {
        if (!query) {
          throw new Error('Query cannot be null or undefined');
        }
        return (
          strictRegistry.getQueryHandlerFactory.mock.results[0]?.value || {
            create: jest.fn().mockReturnValue({
              handle: jest.fn().mockResolvedValue('result'),
            }),
          }
        );
      });

      const strictQueryBus = new QueryBus(mockQueryServices, strictRegistry);

      // When/Then: Should handle invalid input
      await expect(strictQueryBus.execute(null as any)).rejects.toThrow();
      await expect(strictQueryBus.execute(undefined as any)).rejects.toThrow();
    });
  });

  describe('Integration with Real Components', () => {
    it('should handle real exception scenarios', async () => {
      // Given: Real registry and unregistered query
      const realRegistry = QueryHandlerRegistry.Instance;
      const realQueryBus = new QueryBus(mockQueryServices, realRegistry);
      const unknownQuery = new UnknownQuery();

      // When/Then: Should throw real exception
      await expect(realQueryBus.execute(unknownQuery)).rejects.toThrow(
        QueryHandlerNotFoundException,
      );
    });
  });
});
