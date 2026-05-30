/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainException} from './domain-exception.js';

/**
 * Thrown when an operation cannot proceed due to invalid input or state.
 * Maps to HTTP 400 in the API layer.
 *
 * @example
 * throw new InvalidOperationException('Project name is required');
 * throw new InvalidOperationException('Invalid ID', { id: 'abc' });
 */
export class InvalidOperationException extends DomainException {
  readonly errorCode = 'INVALID_OPERATION';

  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
