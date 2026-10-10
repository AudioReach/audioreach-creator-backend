/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {Result} from '../../../shared/result/result.js';
import type {RemoveCkvParametersCommand} from './remove-ckv-parameters.command.js';
import {createZeroCkv} from '../shared/kv-seed-helpers.js';
import {
  getModuleWriteContext,
  withTransaction,
} from '../shared/module-handler-helpers.js';

export interface RemoveCkvParametersResult {
  groupId: string;
  removedParameterSystemIds: number[];
  removedCkvSystemIds: number[];
  affectedCkvSystemIds: number[];
}

export class RemoveCkvParametersHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(
    command: RemoveCkvParametersCommand,
  ): Promise<Result<RemoveCkvParametersResult>> {
    const {groupId, fileSystemId, moduleRepo, defRepo, spfModule} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

    const allCkvs = await moduleRepo.getAllCkvsForModule(
      command.spfModuleSystemId,
      fileSystemId,
    );
    const ckvPayloadMap = await moduleRepo.getAllCkvParameterPayloads(
      command.spfModuleSystemId,
    );

    return withTransaction(this.uow, async () => {
      const removedParameterSystemIds: number[] = [];
      const removedCkvSystemIds: number[] = [];
      const affectedCkvSystemIds: number[] = [];

      // Track remaining payload counts per CKV after removals
      const remainingPayloadCount = new Map<number, number>();
      for (const [ckvId, payloads] of ckvPayloadMap) {
        remainingPayloadCount.set(ckvId, payloads.length);
      }

      await this.removeParametersFromCkvs(
        command,
        allCkvs,
        ckvPayloadMap,
        remainingPayloadCount,
        affectedCkvSystemIds,
        moduleRepo,
        removedParameterSystemIds,
      );

      // Collapse only CKVs that this request actually made empty.
      for (const ckvId of new Set(affectedCkvSystemIds)) {
        const count = remainingPayloadCount.get(ckvId) ?? 0;
        const ckv = allCkvs.find(c => c.systemId === ckvId);
        if (!ckv || ckv.valueDefinitionSystemIds.length === 0) continue;
        if (count <= 0) {
          await moduleRepo.removeCkv(ckvId, command.spfModuleSystemId);
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
    allCkvs: Awaited<
      ReturnType<
        ReturnType<UnitOfWork['getModuleRepository']>['getAllCkvsForModule']
      >
    >,
    ckvPayloadMap: Awaited<
      ReturnType<
        ReturnType<
          UnitOfWork['getModuleRepository']
        >['getAllCkvParameterPayloads']
      >
    >,
    remainingPayloadCount: Map<number, number>,
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
        const payloadRow = (ckvPayloadMap.get(ckv.systemId) ?? []).find(
          p => p.parameterSystemId === parameterSystemId,
        );
        if (!payloadRow) continue;
        await moduleRepo.removeParameterFromCkv(
          payloadRow.systemId,
          ckv.systemId,
          command.spfModuleSystemId,
        );
        removed = true;
        remainingPayloadCount.set(
          ckv.systemId,
          (remainingPayloadCount.get(ckv.systemId) ?? 0) - 1,
        );
        if (!affectedCkvSystemIds.includes(ckv.systemId)) {
          affectedCkvSystemIds.push(ckv.systemId);
        }
      }
      if (removed) removedParameterSystemIds.push(parameterSystemId);
    }
  }
}
