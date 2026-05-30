/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainException} from './domain-exception.js';

/**
 * Thrown when a feature/operation is defined but not yet implemented.
 * Maps to HTTP 501 in the API layer.
 *
 * @example
 * throw new DomainNotImplementedException('getSubgraphs is not implemented yet');
 */
export class DomainNotImplementedException extends DomainException {
  readonly errorCode = 'NOT_IMPLEMENTED';

  constructor(message: string = 'Not implemented') {
    super(message);
  }
}
