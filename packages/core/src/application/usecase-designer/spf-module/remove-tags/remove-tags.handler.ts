/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {RemoveTagsCommand} from './remove-tags.command.js';

export interface RemoveTagsResult {
  groupId: string;
  removedTagSystemIds: number[];
}

export class RemoveTagsHandler {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: RemoveTagsCommand): Promise<Result<RemoveTagsResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const moduleRepo = this.uow.getModuleRepository();

    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    const issues = [];
    const toRemove: number[] = [];
    for (const tagSystemId of command.tagSystemIds) {
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

    await this.uow.startTransaction();
    try {
      for (const tagSystemId of toRemove) {
        // Explicit cascade: DB ON DELETE CASCADE only fires on hard-delete
        const tkvs = await moduleRepo.getAllTkvsForTag(
          tagSystemId,
          fileSystemId,
        );
        for (const tkv of tkvs) {
          await moduleRepo.removeTkv(tkv.systemId, command.spfModuleSystemId);
        }
        await moduleRepo.removeTag(tagSystemId, command.spfModuleSystemId);
      }

      await this.uow.commit();
      const data: RemoveTagsResult = {groupId, removedTagSystemIds: toRemove};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
