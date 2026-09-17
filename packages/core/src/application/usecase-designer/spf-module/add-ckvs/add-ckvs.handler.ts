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
import type {AddCkvsCommand} from './add-ckvs.command.js';
import type {AddCkvsResult} from './add-ckvs-result.js';

export class AddCkvsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: AddCkvsCommand): Promise<Result<AddCkvsResult>> {
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
    const existingKeys = new Set(
      existingCkvs.map(c =>
        [...c.valueDefinitionSystemIds].sort((a, b) => a - b).join(','),
      ),
    );

    // Determine parameter list (REQ-PARAMLIST-01/02)
    const nonZeroCkvs = existingCkvs.filter(
      c => c.valueDefinitionSystemIds.length > 0,
    );
    let paramDefs: Awaited<ReturnType<typeof defRepo.getParameterDefinitions>>;
    if (nonZeroCkvs.length > 0) {
      const firstCkvPayloads = await moduleRepo.getCkvParameterPayloads(
        nonZeroCkvs[0].systemId,
        command.spfModuleSystemId,
      );
      paramDefs = await defRepo.getParameterDefinitions(
        spfModule.definitionSystemId,
        firstCkvPayloads.map(p => p.parameterSystemId),
      );
    } else {
      const allDefs = await defRepo.getParameterDefinitions(
        spfModule.definitionSystemId,
      );
      paramDefs = allDefs.filter(d => d.toolPolicy === TOOL_POLICY.Calibration);
    }

    const zeroCkv = await moduleRepo.getZeroCkv(command.spfModuleSystemId);
    let removedFirstZero = false;

    await this.uow.startTransaction();
    try {
      const addedCkvs: AddCkvsResult['addedCkvs'] = [];
      const removedCkvSystemIds: number[] = [];

      for (const item of command.ckvs) {
        const key = [...item.valueDefinitionSystemIds]
          .sort((a, b) => a - b)
          .join(',');
        if (existingKeys.has(key)) continue;

        const ckvSystemId = await this.createCkv(
          item,
          paramDefs,
          command.spfModuleSystemId,
          fileSystemId,
          moduleRepo,
        );
        if (!removedFirstZero && zeroCkv) {
          await moduleRepo.removeCkv(
            zeroCkv.systemId,
            command.spfModuleSystemId,
          );
          removedCkvSystemIds.push(zeroCkv.systemId);
          removedFirstZero = true;
        }

        existingKeys.add(key);
        addedCkvs.push({
          systemId: ckvSystemId,
          valueDefinitionSystemIds: item.valueDefinitionSystemIds,
        });
      }

      await this.uow.commit();
      return Result.ok({groupId, addedCkvs, removedCkvSystemIds});
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async createCkv(
    item: AddCkvsCommand['ckvs'][number],
    paramDefs: Awaited<
      ReturnType<
        ReturnType<
          UnitOfWork['getModuleDefinitionRepository']
        >['getParameterDefinitions']
      >
    >,
    moduleSystemId: number,
    fileSystemId: number,
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
  ): Promise<number> {
    const ckvSystemId = await this.idGeneration.getNextId(fileSystemId);
    const kvData = new KvData({
      systemId: ckvSystemId,
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

    await moduleRepo.createCkv(kvData, moduleSystemId);
    return ckvSystemId;
  }
}
