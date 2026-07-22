/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {StartSessionCommand} from './start-session.command.js';
import type {Result} from '../../shared/result/result.js';
import {Result as ResultFactory} from '../../shared/result/result.js';
import type {SessionResult} from '../session-types.js';
import {ResourceNotFoundException} from '../../../shared/exceptions/resource-not-found.exception.js';
import {InvalidOperationException} from '../../../shared/exceptions/invalid-operation.exception.js';

/**
 * Handles StartSessionCommand — Case 3 (requiresSession = false).
 * Implements REQ-SESS-01 (session existence check) and REQ-SESS-03
 * (single active session invariant I1). (§7b.1)
 *
 * Throws DomainException on total failure (handled by AllExceptionsFilter):
 *   - ResourceNotFoundException  → 404 (project not found)
 *   - InvalidOperationException  → 400 (session already active)
 *
 * Returns Result.ok on success. Never returns Result.fail.
 */
export class StartSessionHandler implements CommandHandler<
  StartSessionCommand,
  Result<SessionResult>
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(cmd: StartSessionCommand): Promise<Result<SessionResult>> {
    await this.uow.startTransaction();
    try {
      const sessionRepo = this.uow.getSessionRepository();

      // READONLY is not a startable mode — it is the implicit state when no session is active.
      if ((cmd.mode as string) === 'READONLY') {
        throw new InvalidOperationException(
          'READONLY is not a startable mode. It is the implicit state when no session is active.',
        );
      }

      const fileSystemId = await sessionRepo.findFileSystemIdByProjectId(
        cmd.projectId,
      );
      if (fileSystemId === null) {
        throw new ResourceNotFoundException(
          `Project '${cmd.projectId}' not found or has no associated file.`,
        );
      }

      const existing =
        await sessionRepo.findActiveSessionByFileSystemId(fileSystemId);
      if (existing !== null) {
        throw new InvalidOperationException(
          `An active session already exists for project ${cmd.projectId} (sessionId ${existing.sessionId}, mode ${existing.mode}). End it before starting a new one.`,
          {existingSessionId: existing.sessionId, existingMode: existing.mode},
        );
      }

      const sessionId = await sessionRepo.createSession({
        fileSystemId,
        sessionMode: cmd.mode,
        userId: cmd.userId ?? null,
      });

      await this.uow.commit();
      return ResultFactory.ok<SessionResult>({
        sessionId,
        projectId: cmd.projectId,
        sessionMode: cmd.mode,
        summary: 'Session started.',
      });
    } catch (error) {
      if (this.uow.isInTransaction()) {
        await this.uow.rollback();
      }
      throw error;
    }
  }
}
