/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Catch, HttpException, HttpStatus, Inject} from '@nestjs/common';
import type {ExceptionFilter, ArgumentsHost} from '@nestjs/common';
import type {Request, Response} from 'express';
import type {Logger, Issue} from '@arc/core';
import {
  DomainException,
  ResourceNotFoundException,
  InvalidInputException,
  InvalidOperationException,
  DomainNotImplementedException,
  DomainRuleViolationException,
  StagedChangesExistException,
  DuplicateLinkException,
  ConflictException,
  NoStagedChangesException,
  CommitValidationFailedException,
} from '@arc/core';

/**
 * Maps domain exception constructors to HTTP status codes.
 * Add new domain exceptions here as the core layer grows.
 */

type DomainExceptionClass = new (
  message: string,
  ...args: unknown[]
) => DomainException;

const DOMAIN_STATUS_MAP = new Map<DomainExceptionClass, number>([
  [ResourceNotFoundException, HttpStatus.NOT_FOUND],
  [InvalidInputException, HttpStatus.BAD_REQUEST],
  [InvalidOperationException, HttpStatus.BAD_REQUEST],
  [DomainNotImplementedException, HttpStatus.NOT_IMPLEMENTED],
  [
    StagedChangesExistException as unknown as DomainExceptionClass,
    HttpStatus.UNPROCESSABLE_ENTITY,
  ],
  [
    NoStagedChangesException as unknown as DomainExceptionClass,
    HttpStatus.UNPROCESSABLE_ENTITY,
  ],
  [
    CommitValidationFailedException as unknown as DomainExceptionClass,
    HttpStatus.UNPROCESSABLE_ENTITY,
  ],
  [DuplicateLinkException, HttpStatus.CONFLICT],
]);

/**
 * A 4xx error raised by Express middleware before the request reaches Nest,
 * so it is not a Nest `HttpException`. Express middleware creates these with
 * the `http-errors` library; the JSON body parser raises, for example:
 *
 * - 413 Payload Too Large: the body is over the 100 KB limit. For instance a
 *   client sends a log through `POST /logs` that is too big; Express rejects
 *   it before the logging controller or `ClientLogWriter` runs.
 * - 415 Unsupported Media Type: the body uses an unsupported charset or
 *   content encoding.
 * - 400 Bad Request: for instance a body whose length does not match its
 *   `Content-Length`. (Malformed JSON is different: Nest already turns it
 *   into a `BadRequestException`.)
 *
 * Without this check such errors would be answered as 500. `expose: true` is
 * the `http-errors` flag that marks the message as safe to return to the
 * caller; the library sets it by default for every status below 500.
 */
interface ExpressClientError extends Error {
  status: number;
  expose: true;
}

function isExpressClientError(
  exception: unknown,
): exception is ExpressClientError {
  if (!(exception instanceof Error)) {
    return false;
  }
  const {status, expose} = exception as Partial<ExpressClientError>;
  return (
    expose === true &&
    typeof status === 'number' &&
    status >= 400 &&
    status < 500
  );
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject('LOGGER') private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const {status, errorCode, details, issues} =
      this.resolveFromException(exception);

    const logContext = {
      component: 'ExceptionFilter',
      eventName: 'handleException',
      description: `${request.method} ${request.url} failed with status ${status}`,
      tag: 'exception',
      error:
        exception instanceof Error ? exception : new Error(String(exception)),
    };

    if (status < 500) {
      this.logger.logWarn(logContext);
    } else {
      this.logger.logError(logContext);
    }

    const errorResponse: Record<string, unknown> = {
      statusCode: status,
      errorCode: errorCode || 'UNKNOWN_ERROR',
      message:
        exception instanceof Error
          ? exception.message
          : 'Internal server error',
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    if (details !== undefined) {
      errorResponse.details = details;
    }

    if (issues !== undefined) {
      errorResponse.issues = issues;
    }

    if (process.env.NODE_ENV !== 'production' && exception instanceof Error) {
      errorResponse.stack = exception.stack;
    }

    response.status(status).json(errorResponse);
  }

  private resolveFromException(exception: unknown): {
    status: number;
    errorCode: string | undefined;
    details: unknown;
    issues: Issue[] | undefined;
  } {
    if (exception instanceof DomainRuleViolationException) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        errorCode: exception.errorCode,
        details: undefined,
        issues: exception.issues as Issue[],
      };
    }
    if (exception instanceof ConflictException) {
      return {
        status: HttpStatus.CONFLICT,
        errorCode: exception.errorCode,
        details: exception.details,
        issues: undefined,
      };
    }
    if (exception instanceof DomainException) {
      return {
        status:
          DOMAIN_STATUS_MAP.get(
            exception.constructor as DomainExceptionClass,
          ) ?? HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: exception.errorCode,
        details: exception.details,
        issues: exception.issues as Issue[] | undefined,
      };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'object' && exResponse != null) {
        const resp = exResponse as Record<string, unknown>;
        return {
          status,
          errorCode: (resp.errorCode as string) ?? exception.name,
          details: resp.details,
          issues: Array.isArray(resp.issues)
            ? (resp.issues as Issue[])
            : undefined,
        };
      }
      return {
        status,
        errorCode: exception.name,
        details: undefined,
        issues: undefined,
      };
    }
    if (isExpressClientError(exception)) {
      return {
        status: exception.status,
        errorCode: exception.name,
        details: undefined,
        issues: undefined,
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'INTERNAL_SERVER_ERROR',
      details: undefined,
      issues: undefined,
    };
  }
}
