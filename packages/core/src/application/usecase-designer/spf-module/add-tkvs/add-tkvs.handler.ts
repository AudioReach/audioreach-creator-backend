/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {Result} from '../../../shared/result/result.js';
import {KvData} from '../../../../domain/entities/common/entities/kv-data.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {AddTkvsCommand} from './add-tkvs.command.js';
import {buildDefaultPayloads} from '../shared/kv-seed-helpers.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';

export interface AddTkvsResult {
  groupId: string;
  addedTkvSystemIds: number[];
}

export class AddTkvsHandler implements CommandHandler<
  AddTkvsCommand,
  Result<AddTkvsResult>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: AddTkvsCommand): Promise<Result<AddTkvsResult>> {
    const {groupId, transact, fileSystemId, moduleRepo, defRepo, spfModule} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

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

    return transact(async () => {
      const addedTkvSystemIds: number[] = [];
      const issues: Issue[] = [];

      for (const item of command.tkvs) {
        const key = [...item.valueDefinitionSystemIds]
          .sort((a, b) => a - b)
          .join(',');
        if (existingKeys.has(key)) continue;

        const tkvSystemId = await this.createTkv(
          item,
          spfModule.definitionSystemId,
          command.tagSystemId,
          command.spfModuleSystemId,
          fileSystemId,
          moduleRepo,
          defRepo,
        );
        existingKeys.add(key);
        addedTkvSystemIds.push(tkvSystemId);
      }

      const data = {groupId, addedTkvSystemIds};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }

  private async createTkv(
    item: AddTkvsCommand['tkvs'][number],
    definitionSystemId: number,
    tagSystemId: number,
    moduleSystemId: number,
    fileSystemId: number,
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
    defRepo: ReturnType<UnitOfWork['getModuleDefinitionRepository']>,
  ): Promise<number> {
    const tkvSystemId = await this.idGeneration.getNextId(fileSystemId);
    const paramDefs = await defRepo.getParameterDefinitions(
      definitionSystemId,
      item.parameterSystemIds,
    );
    const kvData = new KvData({
      systemId: tkvSystemId,
      valueDefinitionSystemIds: item.valueDefinitionSystemIds,
      uiPersistence: null,
    });
    buildDefaultPayloads(kvData, paramDefs);
    await moduleRepo.createTkv(kvData, tagSystemId, moduleSystemId);
    return tkvSystemId;
  }
}
