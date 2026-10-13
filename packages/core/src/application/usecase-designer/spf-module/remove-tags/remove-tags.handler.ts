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
import type {RemoveTagsCommand} from './remove-tags.command.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';

export interface RemoveTagsResult {
  groupId: string;
  removedTagSystemIds: number[];
}

export class RemoveTagsHandler implements CommandHandler<
  RemoveTagsCommand,
  Result<RemoveTagsResult>
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: RemoveTagsCommand): Promise<Result<RemoveTagsResult>> {
    const {groupId, transact, moduleRepo} = await getModuleWriteContext(
      this.uow,
      command.spfModuleSystemId,
    );

    const issues: Issue[] = [];
    const toRemove: number[] = [];
    for (const tagSystemId of new Set(command.tagSystemIds)) {
      const tag = await moduleRepo.getTagBySystemId(
        tagSystemId,
        command.spfModuleSystemId,
      );
      if (!tag) {
        issues.push(IssueFactory.notFound(ISSUE_ENTITY_TYPE.Tag, tagSystemId));
      } else {
        toRemove.push(tagSystemId);
      }
    }

    return transact(async () => {
      const removedTagSystemIds: number[] = [];
      for (const tagSystemId of toRemove) {
        const tkvs = await moduleRepo.getAllTkvsForTag(
          tagSystemId,
          command.spfModuleSystemId,
        );
        for (const tkv of tkvs) {
          await moduleRepo.deleteTkv(tkv.systemId, tagSystemId);
        }
        await moduleRepo.deleteTag(tagSystemId, command.spfModuleSystemId);
        removedTagSystemIds.push(tagSystemId);
      }

      const data: RemoveTagsResult = {groupId, removedTagSystemIds};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }
}
