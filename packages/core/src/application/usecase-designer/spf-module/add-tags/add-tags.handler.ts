/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {AddTagsCommand} from './add-tags.command.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';

export interface AddTagsResult {
  groupId: string;
  addedTags: Array<{systemId: number; naturalId: number; tagName: string}>;
}

export class AddTagsHandler implements CommandHandler<
  AddTagsCommand,
  Result<AddTagsResult>
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: AddTagsCommand): Promise<Result<AddTagsResult>> {
    const {groupId, transact, fileSystemId, moduleRepo} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

    const existingTags = await moduleRepo.getAllTagsForModule(
      command.spfModuleSystemId,
      fileSystemId,
    );
    const existingTagDefIds = new Set(
      existingTags.map(t => t.tagDefinitionSystemId),
    );

    return transact(async () => {
      const addedTags: AddTagsResult['addedTags'] = [];
      const issues: Issue[] = [];

      for (const tagDefinitionSystemId of new Set(
        command.tagDefinitionSystemIds,
      )) {
        if (existingTagDefIds.has(tagDefinitionSystemId)) continue;
        const definition = await moduleRepo.getTagDefinition(
          fileSystemId,
          tagDefinitionSystemId,
        );
        if (!definition) {
          issues.push(
            IssueFactory.notFound(
              ISSUE_ENTITY_TYPE.TagDefinition,
              tagDefinitionSystemId,
            ),
          );
          continue;
        }
        const tagSystemId = await this.idGeneration.getNextId(fileSystemId);
        await moduleRepo.createTag(
          tagSystemId,
          command.spfModuleSystemId,
          tagDefinitionSystemId,
        );
        existingTagDefIds.add(tagDefinitionSystemId);
        addedTags.push({
          systemId: tagSystemId,
          naturalId: definition.naturalId,
          tagName: definition.name,
        });
      }

      const data = {groupId, addedTags};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }
}
