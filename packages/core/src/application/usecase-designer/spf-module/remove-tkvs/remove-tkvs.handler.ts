/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {RemoveTkvsCommand} from './remove-tkvs.command.js';
import {getModuleWriteContext} from '../shared/module-handler-helpers.js';

export interface RemoveTkvsResult {
  groupId: string;
  removedTkvSystemIds: number[];
}

export class RemoveTkvsHandler implements CommandHandler<
  RemoveTkvsCommand,
  Result<RemoveTkvsResult>
> {
  constructor(private readonly uow: UnitOfWork) {}

  async handle(command: RemoveTkvsCommand): Promise<Result<RemoveTkvsResult>> {
    const {groupId, transact, moduleRepo} = await getModuleWriteContext(
      this.uow,
      command.spfModuleSystemId,
    );

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

    const issues: Issue[] = [];
    const toRemove: Array<(typeof existingTkvs)[number]> = [];
    for (const tkvSystemId of new Set(command.tkvSystemIds)) {
      if (!existingTkvMap.has(tkvSystemId)) {
        issues.push(IssueFactory.notFound(ISSUE_ENTITY_TYPE.Tkv, tkvSystemId));
      } else {
        toRemove.push(existingTkvMap.get(tkvSystemId)!);
      }
    }

    return transact(async () => {
      const removedTkvSystemIds: number[] = [];
      for (const tkv of toRemove) {
        await moduleRepo.deleteTkv(tkv.systemId, command.tagSystemId);
        removedTkvSystemIds.push(tkv.systemId);
      }

      const data: RemoveTkvsResult = {groupId, removedTkvSystemIds};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }
}
