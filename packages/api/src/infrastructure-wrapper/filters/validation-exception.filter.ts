/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Catch, BadRequestException, HttpStatus, Inject} from '@nestjs/common';
import type {ExceptionFilter, ArgumentsHost} from '@nestjs/common';
import type {Request, Response} from 'express';
import type {Logger} from '@arc/core';

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  constructor(@Inject('LOGGER') private readonly logger: Logger) {}

  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Extract validation errors if available
    const exceptionResponse = exception.getResponse() as any;
    const validationErrors = exceptionResponse.message || 'Validation failed';

    // Log detailed information about the validation error
    this.logger.logError({
      component: 'ValidationFilter',
      action: 'validationFailed',
      msg: 'Request validation failed',
      timestamp: new Date(),
      tag: 'validation-error',
      error: new Error(
        `Validation errors: ${JSON.stringify(validationErrors, null, 2)}`,
      ),
    });

    // Log the request body and query parameters
    this.logger.logDebug({
      component: 'ValidationFilter',
      action: 'requestDetails',
      msg: 'Request details for failed validation',
      timestamp: new Date(),
      tag: 'validation-debug',
      error: new Error(
        JSON.stringify(
          {
            body: request.body,
            query: request.query,
            params: request.params,
            files: request.files,
            headers: this.sanitizeHeaders(request.headers),
            contentType: request.headers['content-type'],
          },
          null,
          2,
        ),
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
  private sanitizeHeaders(headers: any): any {
    const sanitized = {...headers};
    if (sanitized.authorization) {
      sanitized.authorization = 'Bearer [REDACTED]';
    }
    return sanitized;
  }
}
