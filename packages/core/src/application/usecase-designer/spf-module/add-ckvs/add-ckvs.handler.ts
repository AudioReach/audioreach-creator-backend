/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {RESULT_KIND, Result} from '../../../shared/result/result.js';
import {KvData} from '../../../../domain/entities/common/entities/kv-data.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {AddCkvsCommand} from './add-ckvs.command.js';
import type {AddCkvsResult} from './add-ckvs-result.js';
import {
  buildKvResponse,
  resolveKeyValuePairs,
  throwOnUnexpectedKvResolutionFailure,
} from '../shared/kv-write-response.js';
import {
  resolveParametersToSeed,
  seedKvParameterPayloads,
} from '../shared/kv-seed-helpers.js';

export class AddCkvsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly queryServices: QueryServices,
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
    const firstNonZeroCkv = existingCkvs.find(
      ckv => ckv.valueDefinitionSystemIds.length > 0,
    );
    const paramDefs = await resolveParametersToSeed(
      spfModule.definitionSystemId,
      firstNonZeroCkv?.systemId,
      defRepo,
      systemId =>
        moduleRepo.getCkvParameterPayloads(systemId, command.spfModuleSystemId),
      'CKV',
    );

    const zeroCkv = await moduleRepo.getZeroCkv(command.spfModuleSystemId);
    let removedFirstZero = false;

    await this.uow.startTransaction();
    try {
      const addedCkvs: AddCkvsResult['addedCkvs'] = [];
      const removedCkvSystemIds: number[] = [];
      const issues: Issue[] = [];

      for (const item of command.ckvs) {
        const key = [...item.valueDefinitionSystemIds]
          .sort((a, b) => a - b)
          .join(',');
        if (existingKeys.has(key)) continue;

        const resolvedValues = await resolveKeyValuePairs(
          item.valueDefinitionSystemIds,
          fileSystemId,
          this.queryServices,
        );
        if (resolvedValues.kind !== RESULT_KIND.Ok) {
          throwOnUnexpectedKvResolutionFailure(resolvedValues);
          issues.push(...resolvedValues.issues);
          continue;
        }

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
        addedCkvs.push(
          buildKvResponse(ckvSystemId, resolvedValues.data, paramDefs),
        );
      }

      await this.uow.commit();
      const data = {groupId, addedCkvs, removedCkvSystemIds};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
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
    await seedKvParameterPayloads(
      kvData,
      paramDefs,
      fileSystemId,
      this.idGeneration,
    );
    await moduleRepo.createCkv(kvData, moduleSystemId);
    return ckvSystemId;
  }
}
