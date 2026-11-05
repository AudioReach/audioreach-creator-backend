/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {createParamDecorator, type ExecutionContext} from '@nestjs/common';
import type {AuthenticatedRequest} from '../types/authenticated-request.js';

/** The name the caller registered with, from its verified access token. */
export const ClientName = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user.clientName;
  },
);
