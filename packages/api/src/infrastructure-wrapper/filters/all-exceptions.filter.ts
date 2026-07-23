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
  InvalidOperationException,
  DomainNotImplementedException,
  DomainRuleViolationException,
} from '@arc/core';

/**
 * Maps domain exception constructors to HTTP status codes.
 * Add new domain exceptions here as the core layer grows.
 */

type DomainExceptionClass = new (
  message: string,
  details?: unknown,
) => DomainException;

const DOMAIN_STATUS_MAP = new Map<DomainExceptionClass, number>([
  [ResourceNotFoundException, HttpStatus.NOT_FOUND],
  [InvalidOperationException, HttpStatus.BAD_REQUEST],
  [DomainNotImplementedException, HttpStatus.NOT_IMPLEMENTED],
]);

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
      action: 'handleException',
      msg: `${request.method} ${request.url} failed with status ${status}`,
      timestamp: new Date(),
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
    if (exception instanceof DomainException) {
      return {
        status:
          DOMAIN_STATUS_MAP.get(
            exception.constructor as DomainExceptionClass,
          ) ?? HttpStatus.INTERNAL_SERVER_ERROR,
        errorCode: exception.errorCode,
        details: exception.details,
        issues: undefined,
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
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: 'INTERNAL_SERVER_ERROR',
      details: undefined,
      issues: undefined,
    };
  }
}
