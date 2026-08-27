/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Catch, BadRequestException, HttpStatus, Inject} from '@nestjs/common';
import type {ExceptionFilter, ArgumentsHost} from '@nestjs/common';
import type {Request, Response} from 'express';
import type {Logger} from '@arc/core';

interface ValidationExceptionResponse {
  message: string | string[];
  error?: string;
  statusCode?: number;
}

type HeaderValue = string | string[] | undefined;

interface SanitizedHeaders {
  [key: string]: HeaderValue;
  authorization?: string;
}

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  constructor(@Inject('LOGGER') private readonly logger: Logger) {}

  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Extract validation errors if available
    const exceptionResponse =
      exception.getResponse() as ValidationExceptionResponse;
    const validationErrors: string | string[] =
      exceptionResponse.message || 'Validation failed';

    // Log detailed information about the validation error
    this.logger.logError({
      component: 'ValidationFilter',
      msg: 'validationFailed',
      description: 'Request validation failed',
      tag: 'validation-error',
      error: `Validation errors: ${JSON.stringify(validationErrors, null, 2)}`,
    });

    // Log the request body and query parameters
    this.logger.logDebug({
      component: 'ValidationFilter',
      msg: 'requestDetails',
      description: 'Request details for failed validation',
      tag: 'validation-debug',
      error: JSON.stringify(
        {
          body: request.body as Record<string, unknown>,
          query: request.query,
          params: request.params,
          files: request.files as unknown,
          headers: this.sanitizeHeaders(
            request.headers as Record<string, string | string[] | undefined>,
          ),
          contentType: request.headers['content-type'],
        },
        null,
        2,
      ),
    });

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception.message,
    });
  }

  // Remove sensitive information from headers
  private sanitizeHeaders(
    headers: Record<string, string | string[] | undefined>,
  ): SanitizedHeaders {
    const sanitized: SanitizedHeaders = {...headers};
    if (sanitized.authorization) {
      sanitized.authorization = 'Bearer [REDACTED]';
    }
    return sanitized;
  }
}
