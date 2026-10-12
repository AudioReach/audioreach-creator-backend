/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {RemoveTkvParametersCommand} from './remove-tkv-parameters.command.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';

export interface RemoveTkvParametersResult {
  groupId: string;
  updates: Array<{tkvSystemId: number; removedParameterSystemIds: number[]}>;
}

export class RemoveTkvParametersHandler implements CommandHandler<
  RemoveTkvParametersCommand,
  Result<RemoveTkvParametersResult>
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(
    command: RemoveTkvParametersCommand,
  ): Promise<Result<RemoveTkvParametersResult>> {
    const {groupId, transact, moduleRepo} = await getModuleWriteContext(
      this.uow,
      command.spfModuleSystemId,
    );

    const issues: Issue[] = [];
    const updates: RemoveTkvParametersResult['updates'] = [];

    return transact(async () => {
      for (const {tkvSystemId, parameterSystemIds} of command.updates) {
        const tkv = await moduleRepo.getTkvBySystemId(
          tkvSystemId,
          command.spfModuleSystemId,
        );
        if (!tkv) {
          issues.push(
            IssueFactory.notFound(ISSUE_ENTITY_TYPE.Tkv, tkvSystemId),
          );
          continue;
        }

        const existingPayloads = await moduleRepo.getTkvPayloadEntries(
          tkv.moduleTagIdMapSystemId,
          tkvSystemId,
        );
        const payloadMap = new Map(
          existingPayloads.map(p => [p.parameterSystemId, p]),
        );

        const removedParameterSystemIds: number[] = [];
        for (const parameterSystemId of new Set(parameterSystemIds)) {
          const payloadRow = payloadMap.get(parameterSystemId);
          if (!payloadRow) continue;
          await moduleRepo.deleteParameterFromTkv(
            payloadRow.systemId,
            tkvSystemId,
            tkv.moduleTagIdMapSystemId,
          );
          removedParameterSystemIds.push(parameterSystemId);
        }
        updates.push({tkvSystemId, removedParameterSystemIds});
      }

      const data: RemoveTkvParametersResult = {groupId, updates};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }
}
