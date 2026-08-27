/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {Result} from '../../../shared/result/result.js';
import type {AddTagsCommand} from './add-tags.command.js';

export interface AddTagsResult {
  groupId: string;
  addedTagSystemIds: number[];
}

export class AddTagsHandler {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: AddTagsCommand): Promise<Result<AddTagsResult>> {
    const {session, groupId} = this.uow.getWriteContext();
    const {fileSystemId} = session;
    const moduleRepo = this.uow.getModuleRepository();

    const spfModule = await moduleRepo.getSpfModuleForValidation(
      command.spfModuleSystemId,
      fileSystemId,
    );
    if (!spfModule) throw new ResourceNotFoundException('SpfModule not found');

    const existingTags = await moduleRepo.getAllTagsForModule(
      command.spfModuleSystemId,
      fileSystemId,
    );
    const existingTagDefIds = new Set(
      existingTags.map(t => t.tagDefinitionSystemId),
    );

    await this.uow.startTransaction();
    try {
      const addedTagSystemIds: number[] = [];

      for (const tagDefinitionSystemId of command.tagDefinitionSystemIds) {
        if (existingTagDefIds.has(tagDefinitionSystemId)) continue;
        const tagSystemId = await this.idGeneration.getNextId(fileSystemId);
        await moduleRepo.createTag(
          tagSystemId,
          command.spfModuleSystemId,
          tagDefinitionSystemId,
        );
        existingTagDefIds.add(tagDefinitionSystemId);
        addedTagSystemIds.push(tagSystemId);
      }

      await this.uow.commit();
      return Result.ok({groupId, addedTagSystemIds});
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }
}
