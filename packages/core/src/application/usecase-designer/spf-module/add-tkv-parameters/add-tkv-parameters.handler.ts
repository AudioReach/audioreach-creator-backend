/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import type {AddTkvParametersCommand} from './add-tkv-parameters.command.js';
import type {ParamInfoDto} from '../query/spf-module-dto.js';
import {mapSupportedParameters} from '../shared/kv-write-response.js';
import {
  getModuleWriteContext,
  withTransaction,
} from '../shared/module-handler-helpers.js';

export interface AddTkvParametersResult {
  groupId: string;
  tkvParameters: Array<{tkvSystemId: number; parameters: ParamInfoDto[]}>;
}

export class AddTkvParametersHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(
    command: AddTkvParametersCommand,
  ): Promise<Result<AddTkvParametersResult>> {
    const {groupId, fileSystemId, moduleRepo, defRepo, spfModule} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

    const issues: Issue[] = [];
    const tkvParameters: AddTkvParametersResult['tkvParameters'] = [];

    return withTransaction(this.uow, async () => {
      for (const {tkvSystemId, parameterSystemIds} of command.updates) {
        const itemIssues = await this.addParametersToTkv(
          tkvSystemId,
          parameterSystemIds,
          spfModule.definitionSystemId,
          command.spfModuleSystemId,
          fileSystemId,
          moduleRepo,
          defRepo,
        );
        issues.push(...itemIssues);
        const tkv = await moduleRepo.getTkvBySystemId(
          tkvSystemId,
          command.spfModuleSystemId,
        );
        if (tkv) {
          const payloads = await moduleRepo.getTkvPayloadEntries(
            tkv.moduleTagIdMapSystemId,
            tkvSystemId,
          );
          const parameterIds = payloads.map(
            payload => payload.parameterSystemId,
          );
          const definitions =
            parameterIds.length === 0
              ? []
              : await defRepo.getParameterDefinitions(
                  spfModule.definitionSystemId,
                  parameterIds,
                );
          tkvParameters.push({
            tkvSystemId,
            parameters: mapSupportedParameters(definitions),
          });
        }
      }

      const data: AddTkvParametersResult = {groupId, tkvParameters};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }

  private async addParametersToTkv(
    tkvSystemId: number,
    parameterSystemIds: number[],
    definitionSystemId: number,
    spfModuleSystemId: number,
    fileSystemId: number,
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
    defRepo: ReturnType<UnitOfWork['getModuleDefinitionRepository']>,
  ): Promise<Issue[]> {
    const tkv = await moduleRepo.getTkvBySystemId(
      tkvSystemId,
      spfModuleSystemId,
    );
    if (!tkv) {
      return [IssueFactory.notFound(ISSUE_ENTITY_TYPE.Tkv, tkvSystemId)];
    }

    const allDefs = await defRepo.getParameterDefinitions(
      definitionSystemId,
      parameterSystemIds,
    );
    const defMap = new Map(allDefs.map(d => [d.systemId, d]));
    const existingPayloads = await moduleRepo.getTkvPayloadEntries(
      tkv.moduleTagIdMapSystemId,
      tkvSystemId,
    );
    const existingParameterIds = new Set(
      existingPayloads.map(payload => payload.parameterSystemId),
    );
    const issues: Issue[] = [];
    for (const parameterSystemId of new Set(parameterSystemIds)) {
      const def = defMap.get(parameterSystemId);
      if (!def) {
        issues.push(
          IssueFactory.notFound(
            ISSUE_ENTITY_TYPE.SpfModuleParameterDefinition,
            parameterSystemId,
          ),
        );
        continue;
      }
      if (existingParameterIds.has(parameterSystemId)) continue;
      const serialized = serializeDefaultParameterData(def);
      if (!serialized.ok) {
        issues.push(
          IssueFactory.paramSerializationFailed(
            parameterSystemId,
            serialized.error,
          ),
        );
        continue;
      }
      const payloadSystemId = await this.idGeneration.getNextId(fileSystemId);
      await moduleRepo.addParameterToTkv(
        tkvSystemId,
        tkv.moduleTagIdMapSystemId,
        parameterSystemId,
        payloadSystemId,
        serialized.value,
      );
      existingParameterIds.add(parameterSystemId);
    }
    return issues;
  }
}
