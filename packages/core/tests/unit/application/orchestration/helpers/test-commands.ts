/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {BaseCommand} from '../../../../../src/application/shared/base-command.js';
import {BaseQuery} from '../../../../../src/application/shared/base-query.js';

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
