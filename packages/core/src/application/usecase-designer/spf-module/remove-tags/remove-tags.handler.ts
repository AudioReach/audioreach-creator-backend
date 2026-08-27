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
import type {TkvDto} from '../query/spf-module-dto.js';
import {
  buildKvResponse,
  resolveKeyValuePairs,
} from '../shared/kv-write-response.js';
import type {RemoveTagsCommand} from './remove-tags.command.js';

export interface RemoveTagsResult {
  groupId: string;
  removedTags: Array<{
    systemId: number;
    naturalId: number;
    tagName: string;
    tkvs: TkvDto[];
  }>;
}

export class RemoveTagsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(command: RemoveTagsCommand): Promise<Result<RemoveTagsResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const moduleRepo = this.uow.getModuleRepository();
    const defRepo = this.uow.getModuleDefinitionRepository();

    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    const issues = [];
    const toRemove: Array<{
      systemId: number;
      naturalId: number;
      tagName: string;
    }> = [];
    for (const tagSystemId of new Set(command.tagSystemIds)) {
      const tag = await moduleRepo.getTagBySystemId(
        tagSystemId,
        command.spfModuleSystemId,
      );
      if (!tag) {
        issues.push(IssueFactory.notFound(ISSUE_ENTITY_TYPE.Tag, tagSystemId));
      } else {
        const definition =
          await this.queryServices.tagDefinitionQueryService.getTagDefinition(
            fileSystemId,
            tag.tagDefinitionSystemId,
          );
        if (!definition) {
          issues.push(
            IssueFactory.notFound(
              ISSUE_ENTITY_TYPE.TagDefinition,
              tag.tagDefinitionSystemId,
            ),
          );
          continue;
        }
        toRemove.push({
          systemId: tagSystemId,
          naturalId: definition.naturalId,
          tagName: definition.name,
        });
      }
    }

    await this.uow.startTransaction();
    try {
      const removedTags: RemoveTagsResult['removedTags'] = [];
      for (const tag of toRemove) {
        removedTags.push(
          await this.removeTagAndTkvs(
            tag,
            command.spfModuleSystemId,
            spfModule.definitionSystemId,
            fileSystemId,
            moduleRepo,
            defRepo,
          ),
        );
      }

      await this.uow.commit();
      const data: RemoveTagsResult = {groupId, removedTags};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async removeTagAndTkvs(
    tag: {systemId: number; naturalId: number; tagName: string},
    moduleSystemId: number,
    definitionSystemId: number,
    fileSystemId: number,
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
    defRepo: ReturnType<UnitOfWork['getModuleDefinitionRepository']>,
  ): Promise<RemoveTagsResult['removedTags'][number]> {
    // Explicit cascade: DB ON DELETE CASCADE only fires on hard-delete.
    const tkvs = await moduleRepo.getAllTkvsForTag(
      tag.systemId,
      moduleSystemId,
    );
    const removedTkvs: TkvDto[] = [];
    for (const tkv of tkvs) {
      const payloads = await moduleRepo.getTkvPayloadEntries(
        tag.systemId,
        tkv.systemId,
      );
      const parameterSystemIds = payloads.map(
        payload => payload.parameterSystemId,
      );
      const parameterDefinitions =
        parameterSystemIds.length === 0
          ? []
          : await defRepo.getParameterDefinitions(
              definitionSystemId,
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
        buildKvResponse(
          tkv.systemId,
          resolvedValues.data,
          parameterDefinitions,
        ),
      );
      await moduleRepo.removeTkv(tkv.systemId, tag.systemId);
    }
    await moduleRepo.removeTag(tag.systemId, moduleSystemId);
    return {...tag, tkvs: removedTkvs};
  }
}
