/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ENTITY_TYPE} from '../../../../shared/entity-type.js';
import type {LegacyIssue} from '../../../../shared/issues/issue.js';
import type {RemoveCkvsCommand} from './remove-ckvs.command.js';
import {createZeroCkv} from '../shared/kv-seed-helpers.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';

export interface RemoveCkvsResult {
  groupId: string;
  removedCkvSystemIds: number[];
  addedZeroCkvSystemId?: number;
}

export class RemoveCkvsHandler implements CommandHandler<
  RemoveCkvsCommand,
  Result<RemoveCkvsResult>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly logger?: Logger,
  ) {}

  async handle(command: RemoveCkvsCommand): Promise<Result<RemoveCkvsResult>> {
    const {groupId, transact, fileSystemId, moduleRepo, defRepo, spfModule} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

    const existingCkvs = await moduleRepo.getAllCkvsForModule(
      command.spfModuleSystemId,
      fileSystemId,
    );
    const existingCkvMap = new Map(existingCkvs.map(c => [c.systemId, c]));

    const issues: LegacyIssue[] = [];
    const toRemove: Array<(typeof existingCkvs)[number]> = [];
    for (const ckvSystemId of new Set(command.ckvSystemIds)) {
      if (!existingCkvMap.has(ckvSystemId)) {
        issues.push(IssueFactory.notFound(ENTITY_TYPE.Ckv, ckvSystemId));
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
      let addedZeroCkvSystemId: number | undefined;
      if (toRemove.length > 0 && remaining.length === 0 && !zeroCkvRemains) {
        addedZeroCkvSystemId = await createZeroCkv(
          spfModule.definitionSystemId,
          fileSystemId,
          command.spfModuleSystemId,
          moduleRepo,
          defRepo,
          this.idGeneration,
          this.logger,
        );
      }

      const data: RemoveCkvsResult = {
        groupId,
        removedCkvSystemIds,
        addedZeroCkvSystemId,
      };
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }
}
