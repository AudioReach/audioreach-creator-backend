/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {RemoveCkvsCommand} from './remove-ckvs.command.js';
import {createZeroCkv} from '../shared/kv-seed-helpers.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';

export interface RemoveCkvsResult {
  groupId: string;
  removedCkvSystemIds: number[];
}

export class RemoveCkvsHandler implements CommandHandler<
  RemoveCkvsCommand,
  Result<RemoveCkvsResult>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: RemoveCkvsCommand): Promise<Result<RemoveCkvsResult>> {
    const {groupId, transact, fileSystemId, moduleRepo, defRepo, spfModule} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

    const existingCkvs = await moduleRepo.getAllCkvsForModule(
      command.spfModuleSystemId,
      fileSystemId,
    );
    const existingCkvMap = new Map(existingCkvs.map(c => [c.systemId, c]));

    const issues: Issue[] = [];
    const toRemove: Array<(typeof existingCkvs)[number]> = [];
    for (const ckvSystemId of new Set(command.ckvSystemIds)) {
      if (!existingCkvMap.has(ckvSystemId)) {
        issues.push(IssueFactory.notFound(ISSUE_ENTITY_TYPE.Ckv, ckvSystemId));
      } else {
        toRemove.push(existingCkvMap.get(ckvSystemId)!);
      }
    }

    return transact(async () => {
      const removedCkvSystemIds: number[] = [];
      for (const ckv of toRemove) {
        await moduleRepo.deleteCkv(ckv.systemId, command.spfModuleSystemId);
        removedCkvSystemIds.push(ckv.systemId);
      }

      // Check if any non-zero CKVs remain
      const remaining = existingCkvs.filter(
        c =>
          c.valueDefinitionSystemIds.length > 0 &&
          !toRemove.some(removed => removed.systemId === c.systemId),
      );
      const zeroCkvRemains = existingCkvs.some(
        c =>
          c.valueDefinitionSystemIds.length === 0 &&
          !toRemove.some(removed => removed.systemId === c.systemId),
      );
      if (toRemove.length > 0 && remaining.length === 0 && !zeroCkvRemains) {
        await createZeroCkv(
          spfModule.definitionSystemId,
          fileSystemId,
          command.spfModuleSystemId,
          moduleRepo,
          defRepo,
          this.idGeneration,
        );
      }

      const data: RemoveCkvsResult = {groupId, removedCkvSystemIds};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }
}
