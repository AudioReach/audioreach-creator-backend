/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainException} from './domain-exception.js';

/**
 * Thrown when end-session is called while staged changes remain uncommitted.
 * Maps to HTTP 422 in the API layer.
 *
 * @example
 * throw new StagedChangesExistException(3);
 */
export class StagedChangesExistException extends DomainException {
  readonly errorCode = 'STAGED_CHANGES_EXIST';

  constructor(stagedCount: number) {
    super(
      `Cannot end session: ${stagedCount} staged change(s) must be committed or discarded first.`,
      {stagedCount},
    );
  }
}
