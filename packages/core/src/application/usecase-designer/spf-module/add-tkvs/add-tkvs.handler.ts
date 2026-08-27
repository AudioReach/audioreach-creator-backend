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
import type {AddTkvsCommand} from './add-tkvs.command.js';
import type {TkvDto} from '../query/spf-module-dto.js';
import {
  buildKvResponse,
  resolveKeyValuePairs,
  throwOnUnexpectedKvResolutionFailure,
} from '../shared/kv-write-response.js';
import {
  resolveParametersToSeed,
  seedKvParameterPayloads,
} from '../shared/kv-seed-helpers.js';

export interface AddTkvsResult {
  groupId: string;
  addedTkvs: TkvDto[];
}

export class AddTkvsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(command: AddTkvsCommand): Promise<Result<AddTkvsResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const moduleRepo = this.uow.getModuleRepository();
    const defRepo = this.uow.getModuleDefinitionRepository();

    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

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

    const paramDefs = await resolveParametersToSeed(
      spfModule.definitionSystemId,
      existingTkvs[0]?.systemId,
      defRepo,
      systemId =>
        moduleRepo.getTkvPayloadEntries(command.tagSystemId, systemId),
      'TKV',
    );

    await this.uow.startTransaction();
    try {
      const addedTkvs: AddTkvsResult['addedTkvs'] = [];
      const issues: Issue[] = [];

      for (const item of command.tkvs) {
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

        const tkvSystemId = await this.createTkv(
          item,
          paramDefs,
          command.tagSystemId,
          command.spfModuleSystemId,
          fileSystemId,
          moduleRepo,
        );
        existingKeys.add(key);
        addedTkvs.push(
          buildKvResponse(tkvSystemId, resolvedValues.data, paramDefs),
        );
      }

      await this.uow.commit();
      const data = {groupId, addedTkvs};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async createTkv(
    item: AddTkvsCommand['tkvs'][number],
    paramDefs: Awaited<
      ReturnType<
        ReturnType<
          UnitOfWork['getModuleDefinitionRepository']
        >['getParameterDefinitions']
      >
    >,
    tagSystemId: number,
    moduleSystemId: number,
    fileSystemId: number,
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
  ): Promise<number> {
    const tkvSystemId = await this.idGeneration.getNextId(fileSystemId);
    const kvData = new KvData({
      systemId: tkvSystemId,
      valueDefinitionSystemIds: item.valueDefinitionSystemIds,
      uiPersistence: null,
    });
    await seedKvParameterPayloads(
      kvData,
      paramDefs,
      fileSystemId,
      this.idGeneration,
    );
    await moduleRepo.createTkv(kvData, tagSystemId, moduleSystemId);
    return tkvSystemId;
  }
}
