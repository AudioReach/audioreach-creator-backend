/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {
  CkvSummary,
  ModuleRepository,
} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {ModuleDefinitionRepository} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {RESULT_KIND, Result} from '../../../shared/result/result.js';
import {KvData} from '../../../../domain/entities/common/entities/kv-data.js';
import {ModuleParameterData} from '../../../../domain/entities/common/value-objects/module-parameter-data.js';
import {TOOL_POLICY} from '../../../../domain/entities/definitions/common/types/tool-policy-type.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import {asSystemId} from '../../../../shared/types/branded-ids.js';
import type {RemoveCkvsCommand} from './remove-ckvs.command.js';
import type {CkvDto} from '../query/spf-module-dto.js';
import {
  buildKvResponse,
  resolveKeyValuePairs,
} from '../shared/kv-write-response.js';

export interface RemoveCkvsResult {
  groupId: string;
  removedCkvs: CkvDto[];
}

export class RemoveCkvsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly queryServices: QueryServices,
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
    const toRemove: Array<(typeof existingCkvs)[number]> = [];
    for (const ckvSystemId of new Set(command.ckvSystemIds)) {
      if (!existingCkvMap.has(ckvSystemId)) {
        issues.push(IssueFactory.notFound(ISSUE_ENTITY_TYPE.Ckv, ckvSystemId));
      } else {
        toRemove.push(existingCkvMap.get(ckvSystemId)!);
      }
    }

    await this.uow.startTransaction();
    try {
      const removedCkvs: CkvDto[] = [];
      for (const ckv of toRemove) {
        removedCkvs.push(
          await this.buildRemovedCkv(
            ckv,
            command.spfModuleSystemId,
            spfModule.definitionSystemId,
            fileSystemId,
            moduleRepo,
            defRepo,
          ),
        );
        await moduleRepo.removeCkv(ckv.systemId, command.spfModuleSystemId);
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
        await this.restoreZeroCkv(
          spfModule.definitionSystemId,
          fileSystemId,
          command.spfModuleSystemId,
          moduleRepo,
          defRepo,
        );
      }

      await this.uow.commit();
      const data: RemoveCkvsResult = {groupId, removedCkvs};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async buildRemovedCkv(
    ckv: CkvSummary,
    moduleSystemId: number,
    definitionSystemId: number,
    fileSystemId: number,
    moduleRepo: ModuleRepository,
    defRepo: ModuleDefinitionRepository,
  ): Promise<CkvDto> {
    const payloads = await moduleRepo.getCkvParameterPayloads(
      ckv.systemId,
      moduleSystemId,
    );
    const parameterSystemIds = payloads.map(
      payload => payload.parameterSystemId,
    );
    const paramDefs =
      parameterSystemIds.length === 0
        ? []
        : await defRepo.getParameterDefinitions(
            definitionSystemId,
            parameterSystemIds,
          );
    const resolvedValues = await resolveKeyValuePairs(
      ckv.valueDefinitionSystemIds,
      fileSystemId,
      this.queryServices,
    );
    if (resolvedValues.kind !== RESULT_KIND.Ok) {
      throw new Error(
        resolvedValues.issues.map(issue => issue.message).join('; '),
      );
    }
    return buildKvResponse(ckv.systemId, resolvedValues.data, paramDefs);
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
    await moduleRepo.createCkv(kvData, moduleSystemId);
  }
}
