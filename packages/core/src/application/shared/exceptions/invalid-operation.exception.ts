/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainException} from './domain-exception.js';

/**
 * Thrown when an operation cannot proceed due to an invalid operation or state.
 * Maps to HTTP 400 in the API layer.
 *
 * @example
 * throw new InvalidOperationException('A session is already active');
 */
export class InvalidOperationException extends DomainException {
  readonly errorCode = 'INVALID_OPERATION';

  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
