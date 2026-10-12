/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {TkvDto} from '../query/spf-module-dto.js';
import {buildRemovedKvDto} from '../shared/kv-write-response.js';
import type {RemoveTagsCommand} from './remove-tags.command.js';
import type {ModuleRepository} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {ModuleDefinitionRepository} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';

export interface RemoveTagsResult {
  groupId: string;
  removedTags: Array<{
    systemId: number;
    naturalId: number;
    tagName: string;
    tkvs: TkvDto[];
  }>;
}

export class RemoveTagsHandler implements CommandHandler<
  RemoveTagsCommand,
  Result<RemoveTagsResult>
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: RemoveTagsCommand): Promise<Result<RemoveTagsResult>> {
    const {groupId, transact, fileSystemId, moduleRepo, defRepo, spfModule} =
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
        const definition = await moduleRepo.getTagDefinition(
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

    return transact(async () => {
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
    moduleRepo: ModuleRepository,
    defRepo: ModuleDefinitionRepository,
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
        moduleRepo,
      );
      issues.push(...built.issues);
      removedTkvs.push(built.dto);
      await moduleRepo.deleteTkv(tkv.systemId, tag.systemId);
    }
    await moduleRepo.deleteTag(tag.systemId, moduleSystemId);
    return {tag: {...tag, tkvs: removedTkvs}, issues};
  }
}
