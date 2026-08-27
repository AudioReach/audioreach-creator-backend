/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {
  CkvSummary,
  ModuleRepository,
  PayloadEntry,
} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {ParameterDefinitionBase} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import {KvData} from '../../../../domain/entities/common/entities/kv-data.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import type {AddCkvParametersCommand} from './add-ckv-parameters.command.js';
import type {ParamInfoDto} from '../query/spf-module-dto.js';
import {mapSupportedParameters} from '../shared/kv-write-response.js';

export interface AddCkvParametersResult {
  groupId: string;
  parameters: ParamInfoDto[];
}

export class AddCkvParametersHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(
    command: AddCkvParametersCommand,
  ): Promise<Result<AddCkvParametersResult>> {
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
    const nonZeroCkvs = allCkvs.filter(
      c => c.valueDefinitionSystemIds.length > 0,
    );
    const ckvPayloadMap = await moduleRepo.getAllCkvParameterPayloads(
      command.spfModuleSystemId,
    );

    const allDefs = await defRepo.getParameterDefinitions(
      spfModule.definitionSystemId,
      command.parameterSystemIds,
    );
    const defMap = new Map(allDefs.map(d => [d.systemId, d]));
    const issues: Issue[] = [];
    const parameterSystemIds = [...new Set(command.parameterSystemIds)];

    await this.uow.startTransaction();
    try {
      const targetCkvs = await this.ensureTargetCkvs(
        nonZeroCkvs.length > 0 ? nonZeroCkvs : allCkvs,
        allDefs.length > 0,
        command.spfModuleSystemId,
        fileSystemId,
        ckvPayloadMap,
        moduleRepo,
      );

      for (const parameterSystemId of parameterSystemIds) {
        if (!defMap.has(parameterSystemId)) {
          issues.push(
            IssueFactory.notFound(
              ISSUE_ENTITY_TYPE.SpfModuleParameterDefinition,
              parameterSystemId,
            ),
          );
          continue;
        }
        await this.addParameterToCkvs(
          parameterSystemId,
          defMap,
          targetCkvs,
          ckvPayloadMap,
          command.spfModuleSystemId,
          fileSystemId,
          moduleRepo,
        );
      }

      const supportedParameterIds = new Set(
        [...ckvPayloadMap.values()]
          .flat()
          .map(payload => payload.parameterSystemId),
      );
      for (const parameterSystemId of parameterSystemIds) {
        if (defMap.has(parameterSystemId) && targetCkvs.length > 0) {
          supportedParameterIds.add(parameterSystemId);
        }
      }
      const supportedDefinitions =
        supportedParameterIds.size === 0
          ? []
          : await defRepo.getParameterDefinitions(
              spfModule.definitionSystemId,
              [...supportedParameterIds],
            );
      await this.uow.commit();
      const data = {
        groupId,
        parameters: mapSupportedParameters(supportedDefinitions),
      };
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async ensureTargetCkvs(
    existingTargets: CkvSummary[],
    hasValidDefinitions: boolean,
    spfModuleSystemId: number,
    fileSystemId: number,
    ckvPayloadMap: Map<number, PayloadEntry[]>,
    moduleRepo: ModuleRepository,
  ): Promise<CkvSummary[]> {
    if (existingTargets.length > 0 || !hasValidDefinitions) {
      return existingTargets;
    }
    const zeroCkvSystemId = await this.idGeneration.getNextId(fileSystemId);
    await moduleRepo.createCkv(
      new KvData({
        systemId: zeroCkvSystemId,
        valueDefinitionSystemIds: [],
        uiPersistence: null,
      }),
      spfModuleSystemId,
    );
    const zeroCkv = {
      systemId: zeroCkvSystemId,
      spfModuleSystemId,
      valueDefinitionSystemIds: [],
    };
    ckvPayloadMap.set(zeroCkvSystemId, []);
    return [zeroCkv];
  }

  private async addParameterToCkvs(
    parameterSystemId: number,
    defMap: Map<number, ParameterDefinitionBase>,
    targetCkvs: CkvSummary[],
    ckvPayloadMap: Map<number, PayloadEntry[]>,
    spfModuleSystemId: number,
    fileSystemId: number,
    moduleRepo: ModuleRepository,
  ): Promise<void> {
    const def = defMap.get(parameterSystemId);
    if (!def) return;
    const serialized = serializeDefaultParameterData(def);
    if (!serialized.ok) {
      throw new Error(
        `Failed to serialize default data for parameter ${parameterSystemId}: ${serialized.error}`,
      );
    }

    for (const ckv of targetCkvs) {
      const payloads = ckvPayloadMap.get(ckv.systemId) ?? [];
      if (payloads.some(p => p.parameterSystemId === parameterSystemId)) {
        continue;
      }
      const payloadSystemId = await this.idGeneration.getNextId(fileSystemId);
      await moduleRepo.addParameterToCkv(
        ckv.systemId,
        spfModuleSystemId,
        parameterSystemId,
        payloadSystemId,
        serialized.value,
      );
    }
  }
}
