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
import {IssueSeverity} from '@arc/core';
import type {ApiIssueItem} from '../dto/api-response/api-issue-item.dto.js';

/**
 * Interceptor that automatically upgrades the HTTP status code from 200 to 207 (Multi-Status)
 * when a bulk response contains at least one ERROR or FATAL severity issue.
 *
 * Logic (§5.4, FR-6.2/FR-6.3):
 * - If the response body's `issues[]` contains any severity >= ERROR, status is set to 207.
 * - WARNING-only issues (e.g. DATA_LOSS insert failures on an otherwise-successful upload) keep 200.
 * - Absent or empty `issues` keeps the default 200.
 *
 * Usage:
 * Apply to bulk-query controllers via @UseInterceptors(PartialSuccessInterceptor).
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
   * the response has an `issues[]` array containing at least one ERROR or FATAL entry.
   *
   * WARNING-only responses stay 200 — see §5.4 and FR-6.2.
   */
  private isPartialSuccess(body: unknown): boolean {
    if (!body || typeof body !== 'object') return false;
    const response = body as Record<string, unknown>;
    if (!('issues' in response) || !Array.isArray(response.issues))
      return false;
    return (response.issues as ApiIssueItem[]).some(
      i =>
        i.severity === IssueSeverity.Error ||
        i.severity === IssueSeverity.Fatal,
    );
  }
}
