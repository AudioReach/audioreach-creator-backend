/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {DomainException} from './domain-exception.js';

/**
 * Thrown when a requested resource does not exist.
 * Maps to HTTP 404 in the API layer.
 *
 * @example
 * throw new ResourceNotFoundException('Project 123 not found');
 */
export class ResourceNotFoundException extends DomainException {
  readonly errorCode = 'RESOURCE_NOT_FOUND';

  constructor(message: string) {
    super(message);
  }
}
