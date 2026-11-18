/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainException} from './domain-exception.js';

/**
 * Thrown when a request contains malformed or invalid input.
 * Maps to HTTP 400 in the API layer.
 */
export class InvalidInputException extends DomainException {
  readonly errorCode = 'INVALID_INPUT';

  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
