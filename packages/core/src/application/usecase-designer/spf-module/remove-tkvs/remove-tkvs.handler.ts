/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {RESULT_KIND, Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {RemoveTkvsCommand} from './remove-tkvs.command.js';
import type {TkvDto} from '../query/spf-module-dto.js';
import {
  buildKvResponse,
  resolveKeyValuePairs,
} from '../shared/kv-write-response.js';

export interface RemoveTkvsResult {
  groupId: string;
  removedTkvs: TkvDto[];
}

export class RemoveTkvsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(command: RemoveTkvsCommand): Promise<Result<RemoveTkvsResult>> {
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
    const existingTkvMap = new Map(existingTkvs.map(t => [t.systemId, t]));

    const issues = [];
    const toRemove: Array<(typeof existingTkvs)[number]> = [];
    for (const tkvSystemId of new Set(command.tkvSystemIds)) {
      if (!existingTkvMap.has(tkvSystemId)) {
        issues.push(IssueFactory.notFound(ISSUE_ENTITY_TYPE.Tkv, tkvSystemId));
      } else {
        toRemove.push(existingTkvMap.get(tkvSystemId)!);
      }
    }

    await this.uow.startTransaction();
    try {
      const removedTkvs: TkvDto[] = [];
      for (const tkv of toRemove) {
        const payloads = await moduleRepo.getTkvPayloadEntries(
          command.tagSystemId,
          tkv.systemId,
        );
        const parameterSystemIds = payloads.map(
          payload => payload.parameterSystemId,
        );
        const paramDefs =
          parameterSystemIds.length === 0
            ? []
            : await defRepo.getParameterDefinitions(
                spfModule.definitionSystemId,
                parameterSystemIds,
              );
        const resolvedValues = await resolveKeyValuePairs(
          tkv.valueDefinitionSystemIds,
          fileSystemId,
          this.queryServices,
        );
        if (resolvedValues.kind !== RESULT_KIND.Ok) {
          throw new Error(
            resolvedValues.issues.map(issue => issue.message).join('; '),
          );
        }
        removedTkvs.push(
          buildKvResponse(tkv.systemId, resolvedValues.data, paramDefs),
        );
        await moduleRepo.removeTkv(tkv.systemId, command.tagSystemId);
      }

      await this.uow.commit();
      const data: RemoveTkvsResult = {groupId, removedTkvs};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
