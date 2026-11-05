/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable, Inject} from '@nestjs/common';
import type {NestMiddleware} from '@nestjs/common';
import type {Request, Response, NextFunction} from 'express';
import type {Logger} from '@arc/core';
import type {ActiveLogContextProvider} from '@arc/logger';
import {randomUUID} from 'node:crypto';
import {LOG_CONTEXT} from '../logging.module.js';
import {readClientInstanceId} from '../../decorators/client-instance-id.decorator.js';

interface RequestWithLogContext extends Request {
  requestId?: string;
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(
    @Inject('LOGGER') private readonly logger: Logger,
    @Inject(LOG_CONTEXT) private readonly logContext: ActiveLogContextProvider,
  ) {}

  /**
   * Opens the request's log context with the launch ID from
   * `X-ARC-Client-Instance-Id`, if the header holds a UUID; the request is
   * never rejected here. Everything downstream (guards, pipes, controllers,
   * buses, filters) and the response logs below run inside this context.
   *
   * Later stages add what they learn: `ProjectLogContextGuard` the matched
   * route's project and `JwtStrategy` the verified client name. Records
   * written before that (`incomingRequest`, `requestHeaders`) carry neither;
   * their `tag` links them to the request's later records.
   *
   * The request body is never logged: it can hold passwords and tokens. The
   * headers record already shows its content type and length.
   */
  use(req: RequestWithLogContext, res: Response, next: NextFunction): void {
    this.logContext.run({clientInstanceId: readClientInstanceId(req)}, () => {
      this.logRequest(req, res, next);
    });
  }

  private logRequest(
    req: RequestWithLogContext,
    res: Response,
    next: NextFunction,
  ): void {
    // Keep the log correlation ID readable while retaining 48 bits of entropy.
    const requestId = randomUUID().replaceAll('-', '').slice(0, 12);
    const startTime = Date.now();
    req.requestId = requestId;

    this.logger.logInfo({
      component: 'RequestLogger',
      msg: 'incomingRequest',
      description: `${req.method} ${req.originalUrl}`,
      tag: `request-${requestId}`,
    });

    // Log headers at debug level; the authorization and cookie values are redacted.
    this.logger.logDebug({
      component: 'RequestLogger',
      msg: 'requestHeaders',
      description: `Headers: ${JSON.stringify(this.sanitizeHeaders(req.headers))}`,
      tag: `request-${requestId}`,
    });

    // Capture response
    const originalSend = res.send;
    const logger = this.logger;
    const sanitizeResponseBody = this.sanitizeResponseBody.bind(this);

    res.send = function (body: unknown) {
      const responseBody = body instanceof Buffer ? '[Buffer]' : body;
      const responseTime = Date.now() - startTime;

      logger.logInfo({
        component: 'RequestLogger',
        msg: 'outgoingResponse',
        description: `${req.method} ${req.originalUrl} ${res.statusCode} - ${responseTime}ms`,
        tag: `request-${requestId}`,
      });

      logger.logDebug({
        component: 'RequestLogger',
        msg: 'responseBody',
        description: `Body: ${JSON.stringify(
          sanitizeResponseBody(responseBody),
        )}`,
        tag: `request-${requestId}`,
      });

      // 'this' here refers to the response object
      return originalSend.call(this, body);
    };

    next();
  }

  private sanitizeHeaders(
    headers: Request['headers'],
  ): Record<string, string | string[] | undefined> {
    const sanitized = {...headers};
    if (sanitized.authorization) {
      sanitized.authorization = 'Bearer [REDACTED]';
    }
    if (sanitized.cookie) {
      sanitized.cookie = '[REDACTED]';
    }
    return sanitized;
  }

  private sanitizeResponseBody(body: unknown): unknown {
    if (Array.isArray(body)) {
      return body.map(item => this.sanitizeResponseBody(item));
    }
    if (body == null || typeof body !== 'object') {
      return body;
    }

    return Object.fromEntries(
      Object.entries(body as Record<string, unknown>).map(([key, value]) => [
        key,
        ['token', 'accessToken', 'refreshToken'].includes(key)
          ? '[REDACTED]'
          : this.sanitizeResponseBody(value),
      ]),
    );
  }
}
