/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {
  BadRequestException,
  createParamDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import type {Request} from 'express';
import {isUUID} from 'class-validator';
import {ERROR_CODES} from '@arc/core';

/** The client's launch ID; see design §6.2. Express lower-cases header names. */
export const CLIENT_INSTANCE_ID_HEADER = 'x-arc-client-instance-id';

/**
 * The launch ID from `X-ARC-Client-Instance-Id`, lower-cased, or `undefined`
 * when the header is missing or not a UUID. The client reports it itself; it
 * is not verified.
 */
export function readClientInstanceId(req: Request): string | undefined {
  const header = req.headers[CLIENT_INSTANCE_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;
  return value !== undefined && isUUID(value) ? value.toLowerCase() : undefined;
}

/**
 * The caller's launch ID from `X-ARC-Client-Instance-Id`, for endpoints that
 * need it. A missing header is 400 `ERR_1002`; a value that is not a UUID is
 * 400 `ERR_1004`.
 */
export const ClientInstanceId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const launch = readClientInstanceId(request);
    if (launch !== undefined) {
      return launch;
    }
    throw new BadRequestException(
      request.headers[CLIENT_INSTANCE_ID_HEADER] === undefined
        ? {
            message: 'X-ARC-Client-Instance-Id header is required',
            errorCode: ERROR_CODES.MISSING_REQUIRED_FIELD,
          }
        : {
            message: 'X-ARC-Client-Instance-Id must be a UUID',
            errorCode: ERROR_CODES.INVALID_PARAMETER,
          },
    );
  },
);
