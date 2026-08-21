/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainException} from './domain-exception.js';

/**
 * Thrown when a non-deleted link with the same port pair already exists.
 * Maps to HTTP 409 Conflict in the API layer.
 */
export class DuplicateLinkException extends DomainException {
  readonly errorCode = 'DUPLICATE_LINK';

  constructor(message: string) {
    super(message);
  }
}
