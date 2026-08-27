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
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {asSystemId} from '../../../../shared/types/branded-ids.js';
import type {RemoveCkvsCommand} from './remove-ckvs.command.js';

export interface RemoveCkvsResult {
  groupId: string;
  removedCkvSystemIds: number[];
}

export class RemoveCkvsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: RemoveCkvsCommand): Promise<Result<RemoveCkvsResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const moduleRepo = this.uow.getModuleRepository();
    const defRepo = this.uow.getModuleDefinitionRepository();

    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    const existingCkvs = await moduleRepo.getAllCkvsForModule(
      command.spfModuleSystemId,
      fileSystemId,
    );
    const existingCkvMap = new Map(existingCkvs.map(c => [c.systemId, c]));

    const issues = [];
    const toRemove: number[] = [];
    for (const ckvSystemId of command.ckvSystemIds) {
      if (!existingCkvMap.has(ckvSystemId)) {
        issues.push(IssueFactory.notFound(ISSUE_ENTITY_TYPE.Ckv, ckvSystemId));
      } else {
        toRemove.push(ckvSystemId);
      }
    }

    await this.uow.startTransaction();
    try {
      for (const ckvSystemId of toRemove) {
        await moduleRepo.removeCkv(ckvSystemId, command.spfModuleSystemId);
      }

      // Check if any non-zero CKVs remain
      const remaining = existingCkvs.filter(
        c =>
          c.valueDefinitionSystemIds.length > 0 &&
          !toRemove.includes(c.systemId),
      );
      if (remaining.length === 0) {
        await this.restoreZeroCkv(
          spfModule.definitionSystemId,
          fileSystemId,
          command.spfModuleSystemId,
          moduleRepo,
          defRepo,
        );
      }

      await this.uow.commit();
      const data: RemoveCkvsResult = {groupId, removedCkvSystemIds: toRemove};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async restoreZeroCkv(
    definitionSystemId: number,
    fileSystemId: number,
    moduleSystemId: number,
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
    defRepo: ReturnType<UnitOfWork['getModuleDefinitionRepository']>,
  ): Promise<void> {
    const allDefs = await defRepo.getParameterDefinitions(definitionSystemId);
    const calibrationDefs = allDefs.filter(
      d => d.toolPolicy === TOOL_POLICY.Calibration,
    );
    const zeroCkvSystemId = await this.idGeneration.getNextId(fileSystemId);
    const kvData = new KvData({
      systemId: zeroCkvSystemId,
      valueDefinitionSystemIds: [],
      uiPersistence: null,
    });
    for (const def of calibrationDefs) {
      if (def.isReadOnly) continue;
      const serialized = serializeDefaultParameterData(def);
      if (!serialized.ok) continue;
      const payloadSystemId = await this.idGeneration.getNextId(fileSystemId);
      const paramData = new ModuleParameterData(
        asSystemId(def.systemId),
        serialized.value,
      );
      paramData.payloadSystemId = payloadSystemId;
      kvData.addParameterPayload(paramData);
    }
    await moduleRepo.createCkv(kvData, moduleSystemId);
  }
}
