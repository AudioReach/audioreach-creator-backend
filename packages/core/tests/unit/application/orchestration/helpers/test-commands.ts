import {BaseCommand} from '@application/shared/base-command';
import {BaseQuery} from '@application/shared/base-query';

/**
 * Simple test command for testing command bus functionality
 */
export class TestCommand extends BaseCommand {
  constructor(
    public readonly testData: string,
    clientId: string = 'test-client',
  ) {
    super(clientId);
  }
}

/**
 * Test command that should not have a registered handler
 */
export class UnknownCommand extends BaseCommand {
  constructor(clientId: string = 'test-client') {
    super(clientId);
  }
}

/**
 * Simple test query for testing query bus functionality
 */
export class TestQuery extends BaseQuery {
  constructor(
    public readonly queryParam: string,
    clientId: string = 'test-client',
  ) {
    super(clientId);
  }
}

/**
 * Test query that should not have a registered handler
 */
export class UnknownQuery extends BaseQuery {
  constructor(clientId: string = 'test-client') {
    super(clientId);
  }
}
