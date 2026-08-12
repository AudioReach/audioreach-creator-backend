/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import type {PutCkvCalDataCommand} from './put-ckv-cal-data.command.js';
import type {PutCkvCalDataResult} from './put-ckv-cal-data-result.js';
import {serializeParameterData} from '../../shared/serialize-elements.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {Result} from '../../../shared/result/result.js';
import {ISSUE_CODE} from '../../../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {ExistingPayloadRow} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {ParameterDefinitionBase} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import type {ElementData} from '../../../../domain/entities/definitions/common/types/element-data.js';

type ParamProcessResult =
  | {ok: true; payloadSystemId: number; paramSystemId: number; payload: Uint8Array}
  | {ok: false; issue: Issue};

export class PutCkvCalDataHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly logger?: Logger,
  ) {}

  async handle(
    command: PutCkvCalDataCommand,
  ): Promise<Result<PutCkvCalDataResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const fileSystemId = session.fileSystemId;
    const moduleRepo = this.uow.getModuleRepository();

    // Step 1: validate SpfModule exists
    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    // Step 2: validate CKV exists
    const ckv = await moduleRepo.getCkvForValidation(
      command.spfModuleSystemId,
      command.ckvSystemId,
    );
    if (!ckv) throw new ResourceNotFoundException('CKV not found');

    // Step 3: fetch existing payloads, then fetch definitions for those parameter IDs
    const existingPayloads = await moduleRepo.getExistingCkvPayloads(
      command.spfModuleSystemId,
      command.ckvSystemId,
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
      succeededParamSystemIds.push(result.paramSystemId);
      writeBatch.push({
        payloadSystemId: result.payloadSystemId,
        payload: result.payload,
      });
    }

    // Step 5: write
    await this.uow.startTransaction();
    try {
      await moduleRepo.setCkvCalData(
        command.spfModuleSystemId,
        command.ckvSystemId,
        writeBatch,
        command.uiPersistence !== undefined
          ? new TextEncoder().encode(command.uiPersistence)
          : undefined,
      );
      await this.uow.commit();
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }

    const data: PutCkvCalDataResult = {groupId, succeededParamSystemIds};
    return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
  }

  private processParam(
    param: {systemId: number; elements: ElementData[]},
    payloadMap: Map<number, ExistingPayloadRow>,
    defMap: Map<number, ParameterDefinitionBase>,
  ): ParamProcessResult {
    const existingPayload = payloadMap.get(param.systemId);
    if (!existingPayload) {
      return {
        ok: false,
        issue: {
          code: ISSUE_CODE.PARAM_PAYLOAD_NOT_FOUND,
          message: `Parameter ${param.systemId}: no existing payload row (update-only)`,
          severity: IssueSeverity.Error,
        },
      };
    }
    const def = defMap.get(existingPayload.parameterSystemId);
    if (!def) {
      throw new Error(
        `ParameterDefinition missing for parameterSystemId=${existingPayload.parameterSystemId} — DB integrity violation`,
      );
    }
    if (def.isReadOnly) {
      return {
        ok: false,
        issue: {
          code: ISSUE_CODE.PARAM_READ_ONLY,
          message: `Parameter ${param.systemId}: parameter is read-only`,
          severity: IssueSeverity.Error,
        },
      };
    }
    const serialized = serializeParameterData(def, param.elements, this.logger);
    if (!serialized.ok) {
      return {
        ok: false,
        issue: {
          code: ISSUE_CODE.PARAM_SERIALIZATION_FAILED,
          message: `Parameter ${param.systemId}: ${serialized.error}`,
          severity: IssueSeverity.Error,
        },
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
