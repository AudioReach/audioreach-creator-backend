/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import type {EndSessionCommand} from './end-session.command.js';
import type {Result} from '../../shared/result/result.js';
import {Result as ResultFactory} from '../../shared/result/result.js';
import type {SessionResult} from '../session-types.js';

/**
 * Implements REQ-SESS-09 (wipe UNSTAGED) and REQ-SESS-10 (retain as audit). (§7b.2)
 */
export class EndSessionHandler implements CommandHandler<
  EndSessionCommand,
  Result<SessionResult>
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(_cmd: EndSessionCommand): Promise<Result<SessionResult>> {
    await this.uow.startTransaction();
    try {
      const session = this.uow.getWriteContext().session;
      const sessionRepo = this.uow.getSessionRepository();

      const wipedCount = await sessionRepo.wipeUnstagedForSession(
        session.sessionId,
      );

      const commitCount = await sessionRepo.countCommitsForSession(
        session.sessionId,
      );
      if (commitCount === 0) {
        await sessionRepo.deleteSession(session.sessionId);
      } else {
        await sessionRepo.markSessionEnded(session.sessionId);
      }

      await this.uow.commit();
      return ResultFactory.ok<SessionResult>({
        sessionId: session.sessionId,
        projectId: session.projectId,
        sessionMode: session.mode,
        summary:
          commitCount > 0
            ? `Session ended with ${commitCount} commit(s). ${wipedCount} unstaged change(s) discarded. Session retained as audit history.`
            : `Session ended with no commits. ${wipedCount} unstaged change(s) discarded. Session record removed.`,
      });
    } catch (error) {
      if (this.uow.isInTransaction()) {
        await this.uow.rollback();
      }
      throw error;
    }
  }
}
