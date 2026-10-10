/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ISSUE_ENTITY_TYPE} from '../../../../shared/issues/impacted-entity.js';
import type {Issue} from '../../../../shared/issues/issue.js';
import type {RemoveTkvsCommand} from './remove-tkvs.command.js';
import type {TkvDto} from '../query/spf-module-dto.js';
import {buildRemovedKvDto} from '../shared/kv-write-response.js';
import {
  getModuleWriteContext,
  withTransaction,
} from '../shared/module-handler-helpers.js';

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
    const {groupId, fileSystemId, moduleRepo, defRepo, spfModule} =
      await getModuleWriteContext(this.uow, command.spfModuleSystemId);

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

    return withTransaction(this.uow, async () => {
      const removedTkvs: TkvDto[] = [];
      for (const tkv of toRemove) {
        const payloads = await moduleRepo.getTkvPayloadEntries(
          command.tagSystemId,
          tkv.systemId,
        );
        const parameterSystemIds = payloads.map(
          payload => payload.parameterSystemId,
        );
        const built = await buildRemovedKvDto(
          tkv,
          parameterSystemIds,
          spfModule.definitionSystemId,
          fileSystemId,
          defRepo,
          this.queryServices,
        );
        issues.push(...built.issues);
        removedTkvs.push(built.dto);
        await moduleRepo.removeTkv(tkv.systemId, command.tagSystemId);
      }

      const data: RemoveTkvsResult = {groupId, removedTkvs};
      return issues.length > 0 ? Result.partial(data, issues) : Result.ok(data);
    });
  }
}
