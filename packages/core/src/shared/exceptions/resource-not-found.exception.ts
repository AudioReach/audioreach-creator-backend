/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../issues/issue.js';
import {DomainException} from './domain-exception.js';

/**
 * Thrown when a requested resource does not exist.
 * Maps to HTTP 404 in the API layer.
 *
 * @example
 * throw new ResourceNotFoundException('Project 123 not found');
 * throw new ResourceNotFoundException('Project 123 not found', result.issues);
 */
export class ResourceNotFoundException extends DomainException {
  readonly errorCode = 'RESOURCE_NOT_FOUND';

  // TypeScript overload rule: the implementation signature is never visible to
  // callers — only declared overloads are. Both call patterns must be listed
  // explicitly; the implementation below satisfies both.
  constructor(message: string);
  constructor(message: string, issues: readonly Issue[]);
  constructor(message: string, issues?: readonly Issue[]) {
    super(message, undefined, issues);
  }
}
