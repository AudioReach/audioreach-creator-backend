/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Inject, Injectable} from '@nestjs/common';
import type {CanActivate, ExecutionContext} from '@nestjs/common';
import type {Request} from 'express';
import type {ActiveLogContextProvider} from '@arc/logger';
import {LOG_CONTEXT} from '../infrastructure-wrapper/logging.module.js';

/** Longer values are left out of the log context. */
export const MAX_LOGGED_PROJECT_ID_LENGTH = 256;

/**
 * Adds the matched route's `:projectId` to the request's log context, so
 * that every later record of the request carries it, including the
 * `AuthGuard` 401, the `SessionGuard` 403, the exception filters, and the
 * response log. Never rejects a request.
 *
 * Registered as a global guard (`APP_GUARD`), which Nest runs before the
 * controller and route guards. A guard rather than middleware because
 * `request.params` is set only once the route is matched.
 */
@Injectable()
export class ProjectLogContextGuard implements CanActivate {
  constructor(
    @Inject(LOG_CONTEXT) private readonly logContext: ActiveLogContextProvider,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() === 'http') {
      const projectId = readProjectId(
        context.switchToHttp().getRequest<Request>(),
      );
      if (projectId !== undefined) {
        this.logContext.enrich({projectId});
      }
    }
    return true;
  }
}

function readProjectId(req: Request): string | undefined {
  const projectId: unknown = req.params?.['projectId'];
  return typeof projectId === 'string' &&
    projectId !== '' &&
    projectId.length <= MAX_LOGGED_PROJECT_ID_LENGTH
    ? projectId
    : undefined;
}
