/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import type {UpdateTkvCalDataCommand} from './update-tkv-cal-data.command.js';
import type {UpdateTkvCalDataResult} from './update-tkv-cal-data-result.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import {mapDtoToParameterCalibration} from '../get-cal-data/ckv-cal-data-dto.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {ExistingPayloadRow} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {ParameterDefinitionBase} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import type {ParameterElementDto} from '../dto/element-dto.js';

type ParamProcessResult =
  | {
      ok: true;
      payloadSystemId: number;
      paramSystemId: number;
      payload: Uint8Array;
    }
  | {ok: false; issue: Issue};

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
    const tagMapExists = await moduleRepo.moduleTagIdMapExists(
      command.spfModuleSystemId,
      command.tagSystemId,
    );
    if (!tagMapExists)
      throw new ResourceNotFoundException('Tag (moduleTagIdMap) not found');

    // Step 2b: validate TKV exists under this tag map
    const tkvFound = await moduleRepo.tkvExists(
      command.tagSystemId,
      command.tkvSystemId,
    );
    if (!tkvFound) throw new ResourceNotFoundException('TKV not found');

    // Step 3: fetch existing payloads, then fetch definitions for those parameter IDs
    const existingPayloads = await moduleRepo.getExistingTkvPayloads(
      command.tagSystemId,
      command.tkvSystemId,
    );
    const relevantParamSystemIds = existingPayloads.map(
      p => p.parameterSystemId,
    );
    const definitions = await this.uow
      .getModuleDefinitionRepository()
      .getParameterDefinitions(
        spfModule.definitionSystemId,
        relevantParamSystemIds,
      );

    // Step 4: per-parameter validation + serialization
    const payloadMap = new Map(existingPayloads.map(p => [p.systemId, p]));
    const defMap = new Map(definitions.map(d => [d.systemId, d]));
    const issues: Issue[] = [];
    const succeededParamSystemIds: number[] = [];
    const writeBatch: Array<{payloadSystemId: number; payload: Uint8Array}> =
      [];

    for (const param of command.parameters) {
      const result = this.processParam(param, payloadMap, defMap);
      if (!result.ok) {
        issues.push(result.issue);
        continue;
      }
      succeededParamSystemIds.push(result.payloadSystemId);
      writeBatch.push({
        payloadSystemId: result.payloadSystemId,
        payload: result.payload,
      });
    }

    // Step 5: write
    await this.uow.startTransaction();
    try {
      await moduleRepo.setTkvCalData(
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
    return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
  }

  private processParam(
    param: {systemId: number; elements: ParameterElementDto[]},
    payloadMap: Map<number, ExistingPayloadRow>,
    defMap: Map<number, ParameterDefinitionBase>,
  ): ParamProcessResult {
    const existingPayload = payloadMap.get(param.systemId);
    if (!existingPayload) {
      return {
        ok: false,
        issue: IssueFactory.paramPayloadNotFound(param.systemId),
      };
    }
    const def = defMap.get(existingPayload.parameterSystemId);
    if (!def) {
      throw new Error(
        `ParameterDefinition missing for parameterSystemId=${existingPayload.parameterSystemId} — DB integrity violation`,
      );
    }
    if (def.isReadOnly) {
      return {ok: false, issue: IssueFactory.paramReadOnly(param.systemId)};
    }
    const serialized = serializeParameterData(
      def,
      mapDtoToParameterCalibration(param.elements),
      this.logger,
    );
    if (!serialized.ok) {
      return {
        ok: false,
        issue: IssueFactory.paramSerializationFailed(
          param.systemId,
          serialized.error,
        ),
      };
    }
    return {
      ok: true,
      payloadSystemId: param.systemId,
      paramSystemId: existingPayload.parameterSystemId,
      payload: serialized.value,
    };
  }
}
