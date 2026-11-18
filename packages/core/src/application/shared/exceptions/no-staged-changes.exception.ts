/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainException} from './domain-exception.js';

export class NoStagedChangesException extends DomainException {
  readonly errorCode = 'NO_STAGED_CHANGES';

  constructor() {
    super('No staged changes are available to commit.');
  }
}
