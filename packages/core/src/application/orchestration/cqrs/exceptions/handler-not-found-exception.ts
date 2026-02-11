/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

/**
 * @publicApi
 */
export class CommandHandlerNotFoundException extends Error {
  constructor(commandName: string) {
    super(`No handler found for the command: "${commandName}".`);
    this.name = 'CommandHandlerNotFoundException';
  }
}

export class QueryHandlerNotFoundException extends Error {
  constructor(queryName: string) {
    super(`No handler found for the query: "${queryName}".`);
    this.name = 'QueryHandlerNotFoundException';
  }
}
