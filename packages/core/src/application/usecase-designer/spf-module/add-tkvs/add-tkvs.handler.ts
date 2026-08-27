/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {
  ModuleRepository,
  TkvSummary,
} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {
  ModuleDefinitionRepository,
  ModuleParameterDefinition,
} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {RESULT_KIND, Result} from '../../../shared/result/result.js';
import {KvData} from '../../../../domain/entities/common/entities/kv-data.js';
import {ModuleParameterData} from '../../../../domain/entities/common/value-objects/module-parameter-data.js';
import {TOOL_POLICY} from '../../../../domain/entities/definitions/common/types/tool-policy-type.js';
import {asSystemId} from '../../../../shared/types/branded-ids.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {AddTkvsCommand} from './add-tkvs.command.js';
import type {TkvDto} from '../query/spf-module-dto.js';
import {
  buildKvResponse,
  resolveKeyValuePairs,
  throwOnUnexpectedKvResolutionFailure,
} from '../shared/kv-write-response.js';

export interface AddTkvsResult {
  groupId: string;
  addedTkvs: TkvDto[];
}

export class AddTkvsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(command: AddTkvsCommand): Promise<Result<AddTkvsResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const moduleRepo = this.uow.getModuleRepository();
    const defRepo = this.uow.getModuleDefinitionRepository();

    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    const tag = await moduleRepo.getTagBySystemId(
      command.tagSystemId,
      command.spfModuleSystemId,
    );
    if (!tag) throw new ResourceNotFoundException('Tag not found on module');

    const existingTkvs = await moduleRepo.getAllTkvsForTag(
      command.tagSystemId,
      command.spfModuleSystemId,
    );
    const existingKeys = new Set(
      existingTkvs.map(t =>
        [...t.valueDefinitionSystemIds].sort((a, b) => a - b).join(','),
      ),
    );

    const paramDefs = await this.getParametersToSeed(
      existingTkvs,
      command.tagSystemId,
      spfModule.definitionSystemId,
      moduleRepo,
      defRepo,
    );

    await this.uow.startTransaction();
    try {
      const addedTkvs: AddTkvsResult['addedTkvs'] = [];
      const issues: Issue[] = [];

      for (const item of command.tkvs) {
        const key = [...item.valueDefinitionSystemIds]
          .sort((a, b) => a - b)
          .join(',');
        if (existingKeys.has(key)) continue;

        const resolvedValues = await resolveKeyValuePairs(
          item.valueDefinitionSystemIds,
          fileSystemId,
          this.queryServices,
        );
        if (resolvedValues.kind !== RESULT_KIND.Ok) {
          throwOnUnexpectedKvResolutionFailure(resolvedValues);
          issues.push(...resolvedValues.issues);
          continue;
        }

        const tkvSystemId = await this.createTkv(
          item,
          paramDefs,
          command.tagSystemId,
          command.spfModuleSystemId,
          fileSystemId,
          moduleRepo,
        );
        existingKeys.add(key);
        addedTkvs.push(
          buildKvResponse(tkvSystemId, resolvedValues.data, paramDefs),
        );
      }

      await this.uow.commit();
      const data = {groupId, addedTkvs};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async getParametersToSeed(
    existingTkvs: TkvSummary[],
    tagSystemId: number,
    definitionSystemId: number,
    moduleRepo: ModuleRepository,
    defRepo: ModuleDefinitionRepository,
  ): Promise<ModuleParameterDefinition[]> {
    if (existingTkvs.length === 0) {
      const allDefs = await defRepo.getParameterDefinitions(definitionSystemId);
      return allDefs.filter(
        definition => definition.toolPolicy === TOOL_POLICY.Calibration,
      );
    }

    const payloads = await moduleRepo.getTkvPayloadEntries(
      tagSystemId,
      existingTkvs[0].systemId,
    );
    const parameterSystemIds = payloads.map(
      payload => payload.parameterSystemId,
    );
    if (parameterSystemIds.length === 0) return [];

    const definitions = await defRepo.getParameterDefinitions(
      definitionSystemId,
      parameterSystemIds,
    );
    const foundIds = new Set(
      definitions.map(definition => definition.systemId),
    );
    const missingIds = [...new Set(parameterSystemIds)].filter(
      systemId => !foundIds.has(systemId),
    );
    if (missingIds.length > 0) {
      throw new Error(
        `Parameter definitions missing for inherited TKV payloads: ${missingIds.join(', ')}`,
      );
    }
    return definitions;
  }

  private async createTkv(
    item: AddTkvsCommand['tkvs'][number],
    paramDefs: Awaited<
      ReturnType<
        ReturnType<
          UnitOfWork['getModuleDefinitionRepository']
        >['getParameterDefinitions']
      >
    >,
    tagSystemId: number,
    moduleSystemId: number,
    fileSystemId: number,
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
  ): Promise<number> {
    const tkvSystemId = await this.idGeneration.getNextId(fileSystemId);
    const kvData = new KvData({
      systemId: tkvSystemId,
      valueDefinitionSystemIds: item.valueDefinitionSystemIds,
      uiPersistence: null,
    });

    for (const def of paramDefs) {
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

    await moduleRepo.createTkv(kvData, tagSystemId, moduleSystemId);
    return tkvSystemId;
  }
}
