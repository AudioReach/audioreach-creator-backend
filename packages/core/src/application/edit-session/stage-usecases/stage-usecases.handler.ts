/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_STATUS} from '../../shared/change-vocabulary.js';
import type {CommandHandler} from '../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../ports/persistence/unit-of-work.js';
import {Result} from '../../shared/result/result.js';
import {DomainRuleViolationException} from '../../../shared/exceptions/index.js';
import {ISSUE_CODE} from '../../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../shared/issues/severity.js';
import {BinaryUtils} from '../../../shared/utilities/binary-utils.js';
import {ISSUE_ENTITY_TYPE} from '../../../shared/issues/index.js';
import type {StageUsecasesCommand} from './stage-usecases.command.js';
import type {UsecaseChangesetResult} from './stage-usecases-result.dto.js';

export class StageUsecasesHandler implements CommandHandler<
  StageUsecasesCommand,
  Result<UsecaseChangesetResult>
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    command: StageUsecasesCommand,
  ): Promise<Result<UsecaseChangesetResult>> {
    await this.uow.startTransaction();
    try {
      const ctx = this.uow.getWriteContext();
      const found = await this.uow
        .getSessionRepository()
        .updateChangeStatusByEntitySystemIds(
          ctx.session.sessionId,
          ISSUE_ENTITY_TYPE.UseCase,
          command.systemIds,
          CHANGE_STATUS.Staged,
        );

      if (found.length < command.systemIds.length) {
        const foundSet = new Set(found);
        const missing = command.systemIds.filter(id => !foundSet.has(id));
        throw new DomainRuleViolationException([
          {
            code: ISSUE_CODE.ENTITY_NOT_FOUND,
            severity: IssueSeverity.Error,
            message: `No pending changes found for systemIds: ${missing.map(id => BinaryUtils.toHexString(id)).join(', ')}`,
          },
        ]);
      }

      await this.uow.commit();
      return Result.ok({
        success: true,
        processedSystemIds: found.map(id => BinaryUtils.toHexString(id)),
        failedSystemIds: [],
        message: `Successfully staged ${found.length} usecase(s)`,
      });
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
