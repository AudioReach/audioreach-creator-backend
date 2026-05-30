/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

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

  constructor(message: string, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.details = details;
  }
}
