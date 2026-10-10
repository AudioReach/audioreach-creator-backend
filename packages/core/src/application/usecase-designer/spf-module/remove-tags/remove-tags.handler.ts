/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {TkvDto} from '../query/spf-module-dto.js';
import {buildRemovedKvDto} from '../shared/kv-write-response.js';
import type {RemoveTagsCommand} from './remove-tags.command.js';
import {
  getModuleWriteContext,
  withTransaction,
} from '../shared/module-handler-helpers.js';

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
    const {groupId, fileSystemId, moduleRepo, defRepo, spfModule} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

    const issues: Issue[] = [];
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

    return withTransaction(this.uow, async () => {
      const removedTags: RemoveTagsResult['removedTags'] = [];
      for (const tag of toRemove) {
        const removed = await this.removeTagAndTkvs(
          tag,
          command.spfModuleSystemId,
          spfModule.definitionSystemId,
          fileSystemId,
          moduleRepo,
          defRepo,
        );
        removedTags.push(removed.tag);
        issues.push(...removed.issues);
      }

      const data: RemoveTagsResult = {groupId, removedTags};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }

  private async removeTagAndTkvs(
    tag: {systemId: number; naturalId: number; tagName: string},
    moduleSystemId: number,
    definitionSystemId: number,
    fileSystemId: number,
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
    defRepo: ReturnType<UnitOfWork['getModuleDefinitionRepository']>,
  ): Promise<{
    tag: RemoveTagsResult['removedTags'][number];
    issues: readonly Issue[];
  }> {
    // Explicit cascade: DB ON DELETE CASCADE only fires on hard-delete.
    const tkvs = await moduleRepo.getAllTkvsForTag(
      tag.systemId,
      moduleSystemId,
    );
    const removedTkvs: TkvDto[] = [];
    const issues: Issue[] = [];
    for (const tkv of tkvs) {
      const payloads = await moduleRepo.getTkvPayloadEntries(
        tag.systemId,
        tkv.systemId,
      );
      const parameterSystemIds = payloads.map(
        payload => payload.parameterSystemId,
      );
      const built = await buildRemovedKvDto(
        tkv,
        parameterSystemIds,
        definitionSystemId,
        fileSystemId,
        defRepo,
        this.queryServices,
      );
      issues.push(...built.issues);
      removedTkvs.push(built.dto);
      await moduleRepo.removeTkv(tkv.systemId, tag.systemId);
    }
    await moduleRepo.removeTag(tag.systemId, moduleSystemId);
    return {tag: {...tag, tkvs: removedTkvs}, issues};
  }
}
