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
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import type {AddCkvParametersCommand} from './add-ckv-parameters.command.js';

export interface AddCkvParametersResult {
  groupId: string;
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

    await this.uow.startTransaction();
    try {
      for (const parameterSystemId of command.parameterSystemIds) {
        await this.addParameterToCkvs(
          parameterSystemId,
          defMap,
          nonZeroCkvs.length > 0 ? nonZeroCkvs : allCkvs,
          ckvPayloadMap,
          command.spfModuleSystemId,
          fileSystemId,
          moduleRepo,
        );
      }

      await this.uow.commit();
      return Result.ok({groupId});
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
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
    if (!def || def.isReadOnly) return;
    const serialized = serializeDefaultParameterData(def);
    if (!serialized.ok) return;

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
