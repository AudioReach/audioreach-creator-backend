/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createParamDecorator} from '@nestjs/common';
import type {ExecutionContext} from '@nestjs/common';
import type {ActiveSession} from '@arc/core';
import type {ArcRequest} from './arc-request.js';

/**
 * Extracts the active session from the request, populated by SessionGuard.
 * Use only on methods decorated with @UseGuards(SessionGuard) — the session
 * is guaranteed to be present when the guard passes.
 *
 * @example
 * async myMethod(@ArcSession() session: ActiveSession) { ... }
 */
export const ArcSession = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ActiveSession => {
    const request = ctx.switchToHttp().getRequest<ArcRequest>();
    return request.arcSession!;
  },
);
