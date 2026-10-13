/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {
  CkvSummary,
  CkvPayloadEntry,
  ModuleRepository,
} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {ParameterDefinitionBase} from '../../../ports/persistence/repositories/shared/parameter-definition-base.js';
import {Result} from '../../../shared/result/result.js';
import {KvData} from '../../../../domain/entities/common/entities/kv-data.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import {serializeDefaultParameterData} from '../../shared/serialize-elements.js';
import type {AddCkvParametersCommand} from './add-ckv-parameters.command.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';

export interface AddCkvParametersResult {
  groupId: string;
  affectedCkvSystemIds: number[];
}

export class AddCkvParametersHandler implements CommandHandler<
  AddCkvParametersCommand,
  Result<AddCkvParametersResult>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(
    command: AddCkvParametersCommand,
  ): Promise<Result<AddCkvParametersResult>> {
    const {groupId, transact, fileSystemId, moduleRepo, defRepo, spfModule} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

    const allCkvs = await moduleRepo.getAllCkvsForModule(
      command.spfModuleSystemId,
      fileSystemId,
    );
    const nonZeroCkvs = allCkvs.filter(
      c => c.valueDefinitionSystemIds.length > 0,
    );
    const existingPayloads = await moduleRepo.getCkvPayloadsForParameters(
      command.spfModuleSystemId,
      command.parameterSystemIds,
    );

    const allDefs = await defRepo.getParameterDefinitions(
      spfModule.definitionSystemId,
      command.parameterSystemIds,
    );
    const defMap = new Map(allDefs.map(d => [d.systemId, d]));
    const issues: Issue[] = [];
    const parameterSystemIds = [...new Set(command.parameterSystemIds)];

    return transact(async () => {
      const targetCkvs = await this.ensureTargetCkvs(
        nonZeroCkvs.length > 0 ? nonZeroCkvs : allCkvs,
        allDefs.length > 0,
        command.spfModuleSystemId,
        fileSystemId,
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
          existingPayloads,
          command.spfModuleSystemId,
          moduleRepo,
        );
      }

      const data = {
        groupId,
        affectedCkvSystemIds: targetCkvs.map(c => c.systemId),
      };
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }

  private async ensureTargetCkvs(
    existingTargets: CkvSummary[],
    hasValidDefinitions: boolean,
    spfModuleSystemId: number,
    fileSystemId: number,
    moduleRepo: ModuleRepository,
  ): Promise<CkvSummary[]> {
    if (existingTargets.length > 0) {
      return existingTargets;
    }
    if (!hasValidDefinitions) {
      throw new Error(
        `No valid parameter definitions found for module ${spfModuleSystemId}`,
      );
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
    return [
      {
        systemId: zeroCkvSystemId,
        spfModuleSystemId,
        valueDefinitionSystemIds: [],
      },
    ];
  }

  private async addParameterToCkvs(
    parameterSystemId: number,
    defMap: Map<number, ParameterDefinitionBase>,
    targetCkvs: CkvSummary[],
    existingPayloads: CkvPayloadEntry[],
    spfModuleSystemId: number,
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
      if (
        existingPayloads.some(
          p =>
            p.ckvSystemId === ckv.systemId &&
            p.parameterSystemId === parameterSystemId,
        )
      ) {
        continue;
      }
      await moduleRepo.addParameterToCkv(
        ckv.systemId,
        spfModuleSystemId,
        parameterSystemId,
        serialized.value,
      );
    }
  }
}
