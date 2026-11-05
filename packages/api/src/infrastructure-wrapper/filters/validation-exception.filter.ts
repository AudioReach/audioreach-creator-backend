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
  errorCode?: string;
  details?: unknown;
}

interface RequestWithLogContext extends Request {
  requestId?: string;
}

@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  constructor(@Inject('LOGGER') private readonly logger: Logger) {}

  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<RequestWithLogContext>();
    const requestId = request.requestId
      ? request.requestId.replaceAll('-', '').slice(0, 12)
      : 'unknown';

    // Extract validation errors if available
    const exceptionResponse = exception.getResponse() as
      | ValidationExceptionResponse
      | string;
    const validationErrors: string | string[] =
      (typeof exceptionResponse === 'object'
        ? exceptionResponse.message
        : exceptionResponse) || 'Validation failed';

    // A validation failure is a client error, so it is logged as a warning
    // (FR-EH-11). Only the failed rules are logged: class-validator's messages
    // name the property and the rule, not the submitted value. The request
    // body, query, and parameters are never logged; they can hold passwords
    // and tokens.
    this.logger.logWarn({
      component: 'ValidationFilter',
      msg: 'validationFailed',
      description: 'Request validation failed',
      tag: `request-${requestId}`,
      error: `Validation errors: ${JSON.stringify(validationErrors, null, 2)}`,
    });

    response
      .status(HttpStatus.BAD_REQUEST)
      .json(this.toErrorResponse(exception, exceptionResponse, request.url));
  }

  /**
   * Builds the API error response (FR-EH-06). ValidationPipe puts one message
   * per failed constraint in an array; those go into `message`, so a client
   * can see which field failed, and into `details` for programmatic use.
   */
  private toErrorResponse(
    exception: BadRequestException,
    exceptionResponse: ValidationExceptionResponse | string,
    path: string,
  ): Record<string, unknown> {
    const body =
      typeof exceptionResponse === 'object' ? exceptionResponse : undefined;
    const messages = Array.isArray(body?.message) ? body.message : undefined;

    const errorResponse: Record<string, unknown> = {
      statusCode: HttpStatus.BAD_REQUEST,
      errorCode: body?.errorCode ?? exception.name,
      message: messages ? messages.join('; ') : exception.message,
      timestamp: new Date().toISOString(),
      path,
    };

    const details = messages ?? body?.details;
    if (details !== undefined) {
      errorResponse.details = details;
    }

    if (process.env.NODE_ENV !== 'production') {
      errorResponse.stack = exception.stack;
    }

    return errorResponse;
  }
}
