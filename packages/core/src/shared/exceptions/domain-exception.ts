/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Issue} from '../issues/issue.js';

/**
 * Abstract base class for all domain exceptions.
 * Framework-agnostic — does NOT depend on NestJS or any HTTP library.
 *
 * The API layer's exception filter maps these to HTTP status codes.
 * Domain code should throw subclasses of this instead of HTTP exceptions.
 */
export abstract class DomainException extends Error {
  /**
   * Machine-readable error code for API clients (e.g., 'RESOURCE_NOT_FOUND').
   */
  abstract readonly errorCode: string;

  /**
   * Optional structured details about the error.
   */
  readonly details?: unknown;

  /**
   * Optional structured issues carried from a Result.fail — surfaced as-is
   * in the API error response so callers receive the full diagnostic list.
   */
  readonly issues?: readonly Issue[];

  constructor(message: string, details?: unknown, issues?: readonly Issue[]) {
    const formattedMessage =
      issues && issues.length > 0
        ? `${message}:\n${issues.map((issue, i) => `${i + 1}. ${issue.message}`).join('\n')}`
        : message;
    super(formattedMessage);
    this.name = this.constructor.name;
    this.details = details;
    this.issues = issues;
  }
}
