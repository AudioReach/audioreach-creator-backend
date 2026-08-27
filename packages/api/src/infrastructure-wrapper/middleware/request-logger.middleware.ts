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
  sub?: string;
  [key: string]: unknown;
}

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(@Inject('LOGGER') private readonly logger: Logger) {}

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = randomUUID();
    const startTime = Date.now();

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
      description: `Headers: ${JSON.stringify(req.headers)}`,
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
        description: `Body: ${typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody)}`,
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
        return payload.sub ?? 'unknown';
      }
    } catch {
      // Ignore parsing errors
    }
    return 'unknown';
  }
}
