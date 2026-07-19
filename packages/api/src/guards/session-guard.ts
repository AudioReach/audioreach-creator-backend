/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {Injectable, ForbiddenException, Inject} from '@nestjs/common';
import type {CanActivate, ExecutionContext} from '@nestjs/common';
import type {ISessionRepository} from '@arc/core';
import type {ArcRequest} from './arc-request.js';

/**
 * Resolves the active session for the target project and attaches it to
 * `request.arcSession` (spec §7.1).
 *
 * Applies to Case-1 and Case-2 endpoints only (requiresSession = true).
 * Does NOT check mode allow-lists — that is CommandBus's job.
 * Does NOT perform DB writes.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject('SESSION_REPOSITORY')
    private readonly sessionRepository: ISessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ArcRequest>();
    const projectId = request.params['projectId'] as string;

    const session =
      await this.sessionRepository.findActiveSessionByProjectId(projectId);

    if (!session) {
      throw new ForbiddenException({
        errorCode: 'SESSION_NOT_OPEN',
        message: `No active session for project ${projectId}`,
      });
    }

    request.arcSession = session;
    return true;
  }
}
