/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {RemoveTkvsCommand} from './remove-tkvs.command.js';

export interface RemoveTkvsResult {
  groupId: string;
  removedTkvSystemIds: number[];
}

export class RemoveTkvsHandler {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: RemoveTkvsCommand): Promise<Result<RemoveTkvsResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const moduleRepo = this.uow.getModuleRepository();

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
      fileSystemId,
    );
    const existingTkvMap = new Map(existingTkvs.map(t => [t.systemId, t]));

    const issues = [];
    const toRemove: number[] = [];
    for (const tkvSystemId of command.tkvSystemIds) {
      if (!existingTkvMap.has(tkvSystemId)) {
        issues.push(IssueFactory.notFound(ISSUE_ENTITY_TYPE.Tkv, tkvSystemId));
      } else {
        toRemove.push(tkvSystemId);
      }
    }

    await this.uow.startTransaction();
    try {
      for (const tkvSystemId of toRemove) {
        await moduleRepo.removeTkv(tkvSystemId, command.spfModuleSystemId);
      }

      await this.uow.commit();
      const data: RemoveTkvsResult = {groupId, removedTkvSystemIds: toRemove};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
