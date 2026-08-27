/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {RemoveTkvParametersCommand} from './remove-tkv-parameters.command.js';

export interface RemoveTkvParametersResult {
  groupId: string;
}

export class RemoveTkvParametersHandler {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    command: RemoveTkvParametersCommand,
  ): Promise<Result<RemoveTkvParametersResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const moduleRepo = this.uow.getModuleRepository();

    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    const issues = [];

    await this.uow.startTransaction();
    try {
      for (const {tkvSystemId, parameterSystemIds} of command.updates) {
        const tkv = await moduleRepo.getTkvBySystemId(tkvSystemId, 0);
        if (!tkv) {
          issues.push(
            IssueFactory.notFound(ISSUE_ENTITY_TYPE.Tkv, tkvSystemId),
          );
          continue;
        }

        const existingPayloads = await moduleRepo.getCkvPayloadEntries(
          command.spfModuleSystemId,
          tkvSystemId,
        );
        const payloadMap = new Map(
          existingPayloads.map(p => [p.parameterSystemId, p]),
        );

        for (const parameterSystemId of parameterSystemIds) {
          const payloadRow = payloadMap.get(parameterSystemId);
          if (!payloadRow) continue;
          await moduleRepo.removeParameterFromTkv(
            payloadRow.systemId,
            tkvSystemId,
            command.spfModuleSystemId,
          );
        }
      }

      await this.uow.commit();
      const data: RemoveTkvParametersResult = {groupId};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
