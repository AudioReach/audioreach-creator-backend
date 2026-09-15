/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainException} from './domain-exception.js';

/**
 * Thrown when an operation would create a duplicate resource that must be unique.
 *
 * Maps to HTTP 409 Conflict via AllExceptionsFilter.
 *
 * @example
 * throw new ConflictException(`DataLink for ports (${src}, ${dst}) already exists.`);
 */
export class ConflictException extends DomainException {
  readonly errorCode = 'CONFLICT';

  constructor(message: string) {
    super(message);
  }
}
