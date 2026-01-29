/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable, HttpStatus} from '@nestjs/common';
import type {
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import type {Observable} from 'rxjs';
import {map} from 'rxjs/operators';
import type {Response} from 'express';

/**
 * Interceptor that automatically upgrades the HTTP status code from 200 to 207 (Multi-Status)
 * when a bulk response contains partial failures.
 *
 * Logic:
 * - If the response body has a non-empty `errors` array, the status code is set to 207 Multi-Status.
 * - This applies regardless of whether `data` is empty or populated (handles "all items failed" case).
 * - If `errors` is empty or absent, the default status code (200) is preserved.
 *
 * Usage:
 * Apply to bulk-query controllers via @UseInterceptors(PartialSuccessInterceptor)
 *
 * @see RFC 4918 — 207 Multi-Status
 */
@Injectable()
export class PartialSuccessInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((responseBody: unknown) => {
        if (this.isPartialSuccess(responseBody)) {
          const response = context.switchToHttp().getResponse<Response>();
          response.status(HttpStatus.MULTI_STATUS);
        }
        return responseBody;
      }),
    );
  }

  /**
   * Determines if the response represents a partial success scenario:
   * - The response has a non-empty `issues` array with at least one ERROR or FATAL severity item
   *
   * This triggers 207 regardless of whether `data` is empty or populated.
   * When all items fail, `data` may be empty but the client still gets
   * per-item issue details in `issues[]`.
   */
  private isPartialSuccess(body: unknown): boolean {
    if (!body || typeof body !== 'object') {
      return false;
    }

    const response = body as Record<string, unknown>;

    return (
      'issues' in response &&
      Array.isArray(response.issues) &&
      response.issues.length > 0
    );
  }
}
