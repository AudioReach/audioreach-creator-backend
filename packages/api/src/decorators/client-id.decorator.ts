/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createParamDecorator, type ExecutionContext} from '@nestjs/common';
import type {AuthenticatedRequest} from '../types/authenticated-request.js';

export const ClientId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user.clientId;
  },
);
