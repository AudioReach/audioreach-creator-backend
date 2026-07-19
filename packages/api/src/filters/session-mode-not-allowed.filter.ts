/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Catch, HttpStatus} from '@nestjs/common';
import type {ExceptionFilter, ArgumentsHost} from '@nestjs/common';
import type {Response} from 'express';
import {SessionModeNotAllowedError} from '@arc/core';

/**
 * Maps SessionModeNotAllowedError → HTTP 403 with errorCode SESSION_MODE_NOT_ALLOWED
 * and structured body (spec §7a.5).
 */
@Catch(SessionModeNotAllowedError)
export class SessionModeNotAllowedFilter implements ExceptionFilter {
  catch(exception: SessionModeNotAllowedError, host: ArgumentsHost): void {
    const modesLabel = [...exception.allowedModes].join(', ');
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.FORBIDDEN)
      .json({
        statusCode: HttpStatus.FORBIDDEN,
        errorCode: 'SESSION_MODE_NOT_ALLOWED',
        message: `${exception.commandName} is not allowed in mode ${exception.currentMode}. Allowed modes: [${modesLabel}]`,
        commandName: exception.commandName,
        currentMode: exception.currentMode,
        allowedModes: exception.allowedModes,
      });
  }
}
