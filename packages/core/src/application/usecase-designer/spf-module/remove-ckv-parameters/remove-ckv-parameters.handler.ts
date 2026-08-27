/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import {KvData} from '../../../../domain/entities/common/entities/kv-data.js';
import {ModuleParameterData} from '../../../../domain/entities/common/value-objects/module-parameter-data.js';
import {TOOL_POLICY} from '../../../../domain/entities/definitions/common/types/tool-policy-type.js';
import {asSystemId} from '../../../../shared/types/branded-ids.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import type {RemoveCkvParametersCommand} from './remove-ckv-parameters.command.js';

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
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const moduleRepo = this.uow.getModuleRepository();
    const defRepo = this.uow.getModuleDefinitionRepository();

    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    const allCkvs = await moduleRepo.getAllCkvsForModule(
      command.spfModuleSystemId,
      fileSystemId,
    );
    const ckvPayloadMap = await moduleRepo.getAllCkvParameterPayloads(
      command.spfModuleSystemId,
    );

    await this.uow.startTransaction();
    try {
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

      await this.restoreZeroCkvIfNeeded(
        command,
        allCkvs,
        removedCkvSystemIds,
        spfModule.definitionSystemId,
        fileSystemId,
        moduleRepo,
        defRepo,
      );

      await this.uow.commit();
      const removedCkvIds = new Set(removedCkvSystemIds);
      return Result.ok({
        groupId,
        removedParameterSystemIds,
        removedCkvSystemIds,
        affectedCkvSystemIds: affectedCkvSystemIds.filter(
          ckvSystemId => !removedCkvIds.has(ckvSystemId),
        ),
      });
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
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

  private async restoreZeroCkvIfNeeded(
    command: RemoveCkvParametersCommand,
    allCkvs: Awaited<
      ReturnType<
        ReturnType<UnitOfWork['getModuleRepository']>['getAllCkvsForModule']
      >
    >,
    removedCkvSystemIds: number[],
    definitionSystemId: number,
    fileSystemId: number,
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
    defRepo: ReturnType<UnitOfWork['getModuleDefinitionRepository']>,
  ): Promise<void> {
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
      removedCkvSystemIds.length === 0 ||
      remainingNonZero.length > 0 ||
      zeroCkvRemains
    ) {
      return;
    }

    const allDefs = await defRepo.getParameterDefinitions(definitionSystemId);
    const calibrationDefs = allDefs.filter(
      d =>
        d.toolPolicy === TOOL_POLICY.Calibration &&
        !command.parameterSystemIds.includes(d.systemId),
    );
    const zeroCkvSystemId = await this.idGeneration.getNextId(fileSystemId);
    const kvData = new KvData({
      systemId: zeroCkvSystemId,
      valueDefinitionSystemIds: [],
      uiPersistence: null,
    });
    for (const def of calibrationDefs) {
      const serialized = serializeDefaultParameterData(def);
      if (!serialized.ok) {
        throw new Error(
          `Failed to serialize default data for parameter ${def.systemId}: ${serialized.error}`,
        );
      }
      const payloadSystemId = await this.idGeneration.getNextId(fileSystemId);
      const paramData = new ModuleParameterData(
        asSystemId(def.systemId),
        serialized.value,
      );
      paramData.payloadSystemId = payloadSystemId;
      kvData.addParameterPayload(paramData);
    }
    await moduleRepo.createCkv(kvData, command.spfModuleSystemId);
  }
}
