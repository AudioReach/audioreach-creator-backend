/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {
  ResourceNotFoundException,
  InvalidInputException,
  InvalidOperationException,
} from '../../../../shared/exceptions/index.js';
import type {UpdateTkvCalDataCommand} from './update-tkv-cal-data.command.js';
import type {UpdateTkvCalDataResult} from './update-tkv-cal-data-result.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import {mapDtoToParameterCalibration} from '../get-cal-data/ckv-cal-data-dto.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {Result} from '../../../shared/result/result.js';
import type {PayloadEntry} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {ModuleParameterDefinition} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import type {ParameterElementDto} from '../dto/element-dto.js';

export class UpdateTkvCalDataHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly logger?: Logger,
  ) {}

  async handle(
    command: UpdateTkvCalDataCommand,
  ): Promise<Result<UpdateTkvCalDataResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const fileSystemId = session.fileSystemId;
    const moduleRepo = this.uow.getModuleRepository();

    // Step 1: validate SpfModule exists
    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    // Step 2a: validate tag map exists under this SpfModule
    const tagMapExists = await moduleRepo.tagExists(
      command.spfModuleSystemId,
      command.tagSystemId,
    );
    if (!tagMapExists)
      throw new ResourceNotFoundException('Tag (moduleTagIdMap) not found');

    // Step 2b: validate TKV exists under this tag map
    const tkvFound = await moduleRepo.tkvExists(command.tkvSystemId);
    if (!tkvFound) throw new ResourceNotFoundException('TKV not found');

    // Step 3: fetch existing payloads, then fetch definitions for those parameter IDs
    const payloadEntries = await moduleRepo.getTkvPayloadEntries(
      command.tagSystemId,
      command.tkvSystemId,
    );
    const relevantParamSystemIds = payloadEntries.map(p => p.parameterSystemId);
    const definitions = await this.uow
      .getModuleDefinitionRepository()
      .getParameterDefinitions(
        spfModule.definitionSystemId,
        relevantParamSystemIds,
      );

    // Step 4: per-parameter validation + serialization
    const entryMap = new Map(payloadEntries.map(p => [p.systemId, p]));
    const defMap = new Map(definitions.map(d => [d.systemId, d]));
    const succeededParamSystemIds: number[] = [];
    const writeBatch: Array<{payloadSystemId: number; payload: Uint8Array}> =
      [];

    for (const param of command.parameters) {
      const processed = this.processParam(param, entryMap, defMap);
      succeededParamSystemIds.push(processed.payloadSystemId);
      writeBatch.push({
        payloadSystemId: processed.payloadSystemId,
        payload: processed.payload,
      });
    }

    // Step 5: write
    await this.uow.startTransaction();
    try {
      await moduleRepo.setTkvData(
        command.tagSystemId,
        command.tkvSystemId,
        writeBatch,
        command.uiPersistence,
      );
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw new Error(
        `Tag data write failed — transaction rolled back, no parameters were updated. Cause: ${(error as Error).message}`,
      );
    }

    const data: UpdateTkvCalDataResult = {groupId, succeededParamSystemIds};
    return Result.ok(data);
  }

  private processParam(
    param: {systemId: number; elements: ParameterElementDto[]},
    entryMap: Map<number, PayloadEntry>,
    defMap: Map<number, ModuleParameterDefinition>,
  ): {payloadSystemId: number; paramSystemId: number; payload: Uint8Array} {
    const entry = entryMap.get(param.systemId);
    if (!entry) {
      throw new ResourceNotFoundException(
        `Parameter payload not found: systemId=${param.systemId}`,
      );
    }
    const def = defMap.get(entry.parameterSystemId);
    if (!def) {
      throw new Error(
        `ParameterDefinition missing for parameterSystemId=${entry.parameterSystemId} — DB integrity violation`,
      );
    }
    if (def.isReadOnly) {
      throw new InvalidOperationException(
        `Parameter ${param.systemId} is read-only`,
      );
    }
    const serialized = serializeParameterData(
      def,
      mapDtoToParameterCalibration(param.elements),
      this.logger,
    );
    if (!serialized.ok) {
      throw new InvalidInputException(
        `Parameter ${param.systemId} serialization failed: ${serialized.error}`,
      );
    }
    return {
      payloadSystemId: param.systemId,
      paramSystemId: entry.parameterSystemId,
      payload: serialized.value,
    };
  }
}
