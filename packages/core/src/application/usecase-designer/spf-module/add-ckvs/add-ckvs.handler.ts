/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {Result} from '../../../shared/result/result.js';
import {KvData} from '../../../../domain/entities/common/entities/kv-data.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {AddCkvsCommand} from './add-ckvs.command.js';
import type {AddCkvsResult} from './add-ckvs-result.js';
import {
  getParamDefinitionsForKv,
  buildDefaultPayloads,
} from '../shared/kv-seed-helpers.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';

export class AddCkvsHandler implements CommandHandler<
  AddCkvsCommand,
  Result<AddCkvsResult>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: AddCkvsCommand): Promise<Result<AddCkvsResult>> {
    const {groupId, transact, fileSystemId, moduleRepo, defRepo, spfModule} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

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
    // TODO: cache this in db and gather it.
    const firstCkv = existingCkvs[0];
    const paramDefs = await getParamDefinitionsForKv(
      spfModule.definitionSystemId,
      firstCkv?.systemId,
      defRepo,
      systemId =>
        moduleRepo.getCkvPayloadEntries(command.spfModuleSystemId, systemId),
      'CKV',
    );

    const zeroCkv =
      existingCkvs.find(c => c.valueDefinitionSystemIds.length === 0) ?? null;

    return transact(async () => {
      const addedCkvSystemIds: number[] = [];
      const issues: Issue[] = [];
      let removedZeroCkvSystemId: number | undefined;

      if (zeroCkv) {
        await moduleRepo.deleteCkv(zeroCkv.systemId, command.spfModuleSystemId);
        removedZeroCkvSystemId = zeroCkv.systemId;
      }

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
        existingKeys.add(key);
        addedCkvSystemIds.push(ckvSystemId);
      }

      const data = {groupId, addedCkvSystemIds, removedZeroCkvSystemId};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
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
    buildDefaultPayloads(kvData, paramDefs);
    await moduleRepo.createCkv(kvData, moduleSystemId);
    return ckvSystemId;
  }
}
