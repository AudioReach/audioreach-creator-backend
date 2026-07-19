/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Catch, HttpStatus} from '@nestjs/common';
import type {ExceptionFilter, ArgumentsHost} from '@nestjs/common';
import type {Response} from 'express';
import {SessionRequiredError} from '@arc/core';

/**
 * Maps SessionRequiredError → HTTP 403 with errorCode SESSION_NOT_OPEN (spec §7a.5).
 */
@Catch(SessionRequiredError)
export class SessionRequiredFilter implements ExceptionFilter {
  catch(exception: SessionRequiredError, host: ArgumentsHost): void {
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.FORBIDDEN)
      .json({
        statusCode: HttpStatus.FORBIDDEN,
        errorCode: 'SESSION_NOT_OPEN',
        message: `${exception.commandName} requires an active session`,
      });
  }
}
