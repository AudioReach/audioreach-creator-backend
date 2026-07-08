/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import {ERROR_CODES} from './error-codes.js';

/**
 * Thrown by query handlers when a required entity does not exist in the database.
 * Controllers should catch this by type and map it to HTTP 404.
 */
export class EntityNotFoundError extends Error {
  readonly code = ERROR_CODES.ENTITY_NOT_FOUND;

  constructor(
    public readonly entityType: string,
    public readonly id: number,
  ) {
    super(`${entityType} not found: id=${id}`);
    this.name = 'EntityNotFoundError';
  }
}
