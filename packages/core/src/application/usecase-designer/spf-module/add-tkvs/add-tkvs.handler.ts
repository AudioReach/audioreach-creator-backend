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
import type {AddTkvsCommand} from './add-tkvs.command.js';

export interface AddTkvsResult {
  groupId: string;
  addedTkvs: Array<{systemId: number; valueDefinitionSystemIds: number[]}>;
}

export class AddTkvsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
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
      fileSystemId,
    );
    const existingKeys = new Set(
      existingTkvs.map(t =>
        [...t.valueDefinitionSystemIds].sort((a, b) => a - b).join(','),
      ),
    );

    const allDefs = await defRepo.getParameterDefinitions(
      spfModule.definitionSystemId,
    );
    const paramDefs = allDefs.filter(
      d => d.toolPolicy === TOOL_POLICY.Calibration,
    );

    await this.uow.startTransaction();
    try {
      const addedTkvs: AddTkvsResult['addedTkvs'] = [];

      for (const item of command.tkvs) {
        const key = [...item.valueDefinitionSystemIds]
          .sort((a, b) => a - b)
          .join(',');
        if (existingKeys.has(key)) continue;

        const tkvSystemId = await this.createTkv(
          item,
          paramDefs,
          command.tagSystemId,
          command.spfModuleSystemId,
          fileSystemId,
          moduleRepo,
        );
        existingKeys.add(key);
        addedTkvs.push({
          systemId: tkvSystemId,
          valueDefinitionSystemIds: item.valueDefinitionSystemIds,
        });
      }

      await this.uow.commit();
      return Result.ok({groupId, addedTkvs});
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
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

    await moduleRepo.createTkv(kvData, tagSystemId, moduleSystemId);
    return tkvSystemId;
  }
}
