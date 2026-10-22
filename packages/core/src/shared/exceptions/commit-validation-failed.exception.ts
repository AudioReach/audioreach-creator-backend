/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainException} from './domain-exception.js';

export class CommitValidationFailedException extends DomainException {
  readonly errorCode = 'COMMIT_VALIDATION_FAILED';

  constructor(message: string, details?: unknown) {
    super(message, details);
  }
}
