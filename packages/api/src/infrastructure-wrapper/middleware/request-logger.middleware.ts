/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable, Inject} from '@nestjs/common';
import type {NestMiddleware} from '@nestjs/common';
import type {Request, Response, NextFunction} from 'express';
import type {Logger} from '@arc/core';
import {randomUUID} from 'node:crypto';

interface JwtPayload {
  clientId?: string;
  sub?: string;
  [key: string]: unknown;
}

interface RequestWithLogContext extends Request {
  requestId?: string;
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(@Inject('LOGGER') private readonly logger: Logger) {}

  use(req: RequestWithLogContext, res: Response, next: NextFunction) {
    // Keep the log correlation ID readable while retaining 48 bits of entropy.
    const requestId = randomUUID().replaceAll('-', '').slice(0, 12);
    const startTime = Date.now();
    req.requestId = requestId;

    this.logger.logInfo({
      component: 'RequestLogger',
      msg: 'incomingRequest',
      description: `${req.method} ${req.originalUrl}`,
      tag: `request-${requestId}`,
      source: this.extractClientId(req),
    });

    // Log headers at debug level
    this.logger.logDebug({
      component: 'RequestLogger',
      msg: 'requestHeaders',
      description: `Headers: ${JSON.stringify(this.sanitizeHeaders(req.headers))}`,
      tag: `request-${requestId}`,
      source: this.extractClientId(req),
    });

    // For multipart/form-data requests, we can't easily log the body
    // as it's processed by multer, but we can log the presence of files
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      this.logger.logDebug({
        component: 'RequestLogger',
        msg: 'requestBody',
        description: 'Request contains multipart/form-data',
        tag: `request-${requestId}`,
        source: this.extractClientId(req),
      });
    } else if (
      req.body &&
      Object.keys(req.body as Record<string, unknown>).length > 0
    ) {
      this.logger.logDebug({
        component: 'RequestLogger',
        msg: 'requestBody',
        description: `Body: ${JSON.stringify(req.body)}`,
        tag: `request-${requestId}`,
        source: this.extractClientId(req),
      });
    }

    // Capture response
    const originalSend = res.send;
    const logger = this.logger;
    const extractClientId = this.extractClientId.bind(this);
    const sanitizeResponseBody = this.sanitizeResponseBody.bind(this);

    res.send = function (body: unknown) {
      const responseBody = body instanceof Buffer ? '[Buffer]' : body;
      const responseTime = Date.now() - startTime;

      logger.logInfo({
        component: 'RequestLogger',
        msg: 'outgoingResponse',
        description: `${req.method} ${req.originalUrl} ${res.statusCode} - ${responseTime}ms`,
        tag: `request-${requestId}`,
        source: extractClientId(req),
      });

      logger.logDebug({
        component: 'RequestLogger',
        msg: 'responseBody',
        description: `Body: ${JSON.stringify(
          sanitizeResponseBody(responseBody),
        )}`,
        tag: `request-${requestId}`,
        source: extractClientId(req),
      });

      // 'this' here refers to the response object
      return originalSend.call(this, body);
    };

    next();
  }

  private extractClientId(req: Request): string {
    // Try to extract client ID from JWT token or request
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = JSON.parse(
          Buffer.from(token.split('.')[1], 'base64').toString(),
        ) as JwtPayload;
        return payload.clientId ?? payload.sub ?? 'unknown';
      }
    } catch {
      // Ignore parsing errors
    }
    return 'unknown';
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
