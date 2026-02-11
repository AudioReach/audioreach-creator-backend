/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  CommandHandlerNotFoundException,
  QueryHandlerNotFoundException,
} from '../../../../../../src/application/orchestration/cqrs/exceptions/handler-not-found-exception';

describe('CommandHandlerNotFoundException', () => {
  describe('Exception Creation', () => {
    it('should create exception with command name in message', () => {
      // Given: Command name
      const commandName = 'UnknownCommand';

      // When: Creating exception
      const exception = new CommandHandlerNotFoundException(commandName);

      // Then: Should contain command name in message
      expect(exception.message).toContain(commandName);
      expect(exception.name).toBe('CommandHandlerNotFoundException');
    });

    it('should be instance of Error', () => {
      // Given: Exception
      const exception = new CommandHandlerNotFoundException('TestCommand');

      // Then: Should be proper Error instance
      expect(exception).toBeInstanceOf(Error);
      expect(exception.stack).toBeDefined();
    });

    it('should have correct error name', () => {
      // Given: Exception
      const exception = new CommandHandlerNotFoundException('TestCommand');

      // Then: Should have correct name
      expect(exception.name).toBe('CommandHandlerNotFoundException');
    });

    it('should preserve stack trace', () => {
      // Given: Exception creation
      const exception = new CommandHandlerNotFoundException('TestCommand');

      // Then: Stack trace should be available
      expect(exception.stack).toBeDefined();
      expect(typeof exception.stack).toBe('string');
      expect(exception.stack!.length).toBeGreaterThan(0);
    });
  });

  describe('Error Message Formatting', () => {
    it('should format error message correctly', () => {
      // Given: Different command names
      const testCases = [
        'CreateUserCommand',
        'DeleteOrderCommand',
        'UpdateProductCommand',
      ];

      testCases.forEach(commandName => {
        // When: Creating exception
        const exception = new CommandHandlerNotFoundException(commandName);

        // Then: Message should be properly formatted
        expect(exception.message).toContain(commandName);
        expect(exception.message.length).toBeGreaterThan(commandName.length);
      });
    });

    it('should handle empty command name', () => {
      // Given: Empty command name
      const commandName = '';

      // When: Creating exception
      const exception = new CommandHandlerNotFoundException(commandName);

      // Then: Should still create valid exception
      expect(exception).toBeInstanceOf(Error);
      expect(exception.name).toBe('CommandHandlerNotFoundException');
      expect(exception.message).toBeDefined();
    });
  });
});

describe('QueryHandlerNotFoundException', () => {
  describe('Exception Creation', () => {
    it('should create exception with query name in message', () => {
      // Given: Query name
      const queryName = 'UnknownQuery';

      // When: Creating exception
      const exception = new QueryHandlerNotFoundException(queryName);

      // Then: Should contain query name in message
      expect(exception.message).toContain(queryName);
      expect(exception.name).toBe('QueryHandlerNotFoundException');
    });

    it('should be instance of Error', () => {
      // Given: Exception
      const exception = new QueryHandlerNotFoundException('TestQuery');

      // Then: Should be proper Error instance
      expect(exception).toBeInstanceOf(Error);
      expect(exception.stack).toBeDefined();
    });

    it('should have correct error name', () => {
      // Given: Exception
      const exception = new QueryHandlerNotFoundException('TestQuery');

      // Then: Should have correct name
      expect(exception.name).toBe('QueryHandlerNotFoundException');
    });

    it('should preserve stack trace', () => {
      // Given: Exception creation
      const exception = new QueryHandlerNotFoundException('TestQuery');

      // Then: Stack trace should be available
      expect(exception.stack).toBeDefined();
      expect(typeof exception.stack).toBe('string');
      expect(exception.stack!.length).toBeGreaterThan(0);
    });
  });

  describe('Error Message Formatting', () => {
    it('should format error message correctly', () => {
      // Given: Different query names
      const testCases = [
        'GetUserQuery',
        'FindOrderQuery',
        'SearchProductQuery',
      ];

      testCases.forEach(queryName => {
        // When: Creating exception
        const exception = new QueryHandlerNotFoundException(queryName);

        // Then: Message should be properly formatted
        expect(exception.message).toContain(queryName);
        expect(exception.message.length).toBeGreaterThan(queryName.length);
      });
    });

    it('should handle empty query name', () => {
      // Given: Empty query name
      const queryName = '';

      // When: Creating exception
      const exception = new QueryHandlerNotFoundException(queryName);

      // Then: Should still create valid exception
      expect(exception).toBeInstanceOf(Error);
      expect(exception.name).toBe('QueryHandlerNotFoundException');
      expect(exception.message).toBeDefined();
    });
  });
});
