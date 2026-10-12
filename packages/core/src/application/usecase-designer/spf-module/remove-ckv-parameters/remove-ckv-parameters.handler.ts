/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {Result} from '../../../shared/result/result.js';
import type {RemoveCkvParametersCommand} from './remove-ckv-parameters.command.js';
import {createZeroCkv} from '../shared/kv-seed-helpers.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';
import type {
  CkvSummary,
  CkvPayloadEntry,
} from '../../../ports/persistence/repositories/module/module.repository.js';

export interface RemoveCkvParametersResult {
  groupId: string;
  removedParameterSystemIds: number[];
  removedCkvSystemIds: number[];
  affectedCkvSystemIds: number[];
}

export class RemoveCkvParametersHandler implements CommandHandler<
  RemoveCkvParametersCommand,
  Result<RemoveCkvParametersResult>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(
    command: RemoveCkvParametersCommand,
  ): Promise<Result<RemoveCkvParametersResult>> {
    const {groupId, transact, fileSystemId, moduleRepo, defRepo, spfModule} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

    const allCkvs = await moduleRepo.getAllCkvsForModule(
      command.spfModuleSystemId,
      fileSystemId,
    );
    const payloads = await moduleRepo.getCkvPayloadsForParameters(
      command.spfModuleSystemId,
      command.parameterSystemIds,
    );

    return transact(async () => {
      const removedParameterSystemIds: number[] = [];
      const removedCkvSystemIds: number[] = [];
      const affectedCkvSystemIds: number[] = [];

      await this.removeParametersFromCkvs(
        command,
        allCkvs,
        payloads,
        affectedCkvSystemIds,
        moduleRepo,
        removedParameterSystemIds,
      );

      // Query post-deletion payload counts for the affected CKVs to detect collapse.
      const affectedSet = [...new Set(affectedCkvSystemIds)];
      const countByCkv = await moduleRepo.getCkvPayloadCountByCkvs(
        affectedSet,
        command.spfModuleSystemId,
      );

      for (const ckvId of affectedSet) {
        const count = countByCkv.get(ckvId) ?? 0;
        const ckv = allCkvs.find(c => c.systemId === ckvId);
        if (!ckv || ckv.valueDefinitionSystemIds.length === 0) continue;
        if (count <= 0) {
          await moduleRepo.deleteCkv(ckvId, command.spfModuleSystemId);
          removedCkvSystemIds.push(ckvId);
        }
      }

      const remainingNonZero = allCkvs.filter(
        c =>
          c.valueDefinitionSystemIds.length > 0 &&
          !removedCkvSystemIds.includes(c.systemId),
      );
      const zeroCkvRemains = allCkvs.some(
        c =>
          c.valueDefinitionSystemIds.length === 0 &&
          !removedCkvSystemIds.includes(c.systemId),
      );
      if (
        removedCkvSystemIds.length > 0 &&
        remainingNonZero.length === 0 &&
        !zeroCkvRemains
      ) {
        // REQ-DCP-03 → REQ-RCK-04 → REQ-PARAMLIST-02: seed the restored zero CKV
        // with ALL parameters whose toolPolicy includes CALIBRATION, without
        // excluding the parameters that were just removed from CKV support.
        await createZeroCkv(
          spfModule.definitionSystemId,
          fileSystemId,
          command.spfModuleSystemId,
          moduleRepo,
          defRepo,
          this.idGeneration,
        );
      }

      const removedCkvIds = new Set(removedCkvSystemIds);
      return Result.ok({
        groupId,
        removedParameterSystemIds,
        removedCkvSystemIds,
        affectedCkvSystemIds: affectedCkvSystemIds.filter(
          ckvSystemId => !removedCkvIds.has(ckvSystemId),
        ),
      });
    });
  }

  private async removeParametersFromCkvs(
    command: RemoveCkvParametersCommand,
    allCkvs: CkvSummary[],
    payloads: CkvPayloadEntry[],
    affectedCkvSystemIds: number[],
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
    removedParameterSystemIds: number[],
  ): Promise<void> {
    const nonZeroCkvs = allCkvs.filter(
      c => c.valueDefinitionSystemIds.length > 0,
    );
    for (const parameterSystemId of new Set(command.parameterSystemIds)) {
      let removed = false;
      for (const ckv of nonZeroCkvs) {
        const payloadRow = payloads.find(
          p =>
            p.ckvSystemId === ckv.systemId &&
            p.parameterSystemId === parameterSystemId,
        );
        if (!payloadRow) continue;
        await moduleRepo.deleteParameterFromCkv(
          payloadRow.systemId,
          ckv.systemId,
          command.spfModuleSystemId,
        );
        removed = true;
        if (!affectedCkvSystemIds.includes(ckv.systemId)) {
          affectedCkvSystemIds.push(ckv.systemId);
        }
      }
      if (removed) removedParameterSystemIds.push(parameterSystemId);
    }
  }
}
