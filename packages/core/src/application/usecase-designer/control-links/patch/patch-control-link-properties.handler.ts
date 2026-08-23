/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {PatchControlLinkPropertiesCommand} from './patch-control-link-properties.command.js';
import type {ControlLinkDto} from '../../usecase/dto/component-collection-dto.js';
import {
  ResourceNotFoundException,
  DomainRuleViolationException,
} from '../../../../shared/exceptions/index.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {mapControlLink} from '../../usecase/dto/component-collection-dto.js';

export class PatchControlLinkPropertiesHandler implements CommandHandler<
  PatchControlLinkPropertiesCommand,
  ControlLinkDto[]
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: PatchControlLinkPropertiesCommand): Promise<ControlLinkDto[]> {
    // FR-PCL-01: at least one field must be present
    if (command.allocatedIntents === undefined && command.heapId === undefined) {
      throw new DomainRuleViolationException([
        IssueFactory.validationError('At least one of allocatedIntents or heapId must be provided'),
      ]);
    }

    await this.uow.startTransaction();
    try {
      const result = await this.doHandle(command);
      await this.uow.applyCachedActions();
      await this.uow.commit();
      return result;
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async doHandle(command: PatchControlLinkPropertiesCommand): Promise<ControlLinkDto[]> {
    const ctx = this.uow.getWriteContext();
    const fileSystemId = ctx.session.fileSystemId;
    const repo = this.uow.getControlLinkRepository();

    // FR-PCL-02: link existence
    const controlLink = await repo.findBySystemId(command.controlLinkSystemId, fileSystemId);
    if (controlLink === null) {
      throw new ResourceNotFoundException(`ControlLink ${command.controlLinkSystemId} not found`);
    }

    const modifiedLinks: ControlLinkDto[] = [];

    // FR-PCL-03: update intents
    if (command.allocatedIntents !== undefined) {
      if (command.allocatedIntents.length === 0) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError('allocatedIntents must not be empty'),
        ]);
      }

      const newIntentIds = command.allocatedIntents.map(i => i.id);

      // Update intents on both ports in the connected chain
      const portIds = [controlLink.nodeAPortSystemId, controlLink.nodeBPortSystemId];
      for (const portId of portIds) {
        const existingIntents = await repo.getAllocatedIntentIds(portId, fileSystemId);
        if (existingIntents.length > 0) {
          await repo.deleteIntents(existingIntents.map(e => e.intentSystemId), portId);
        }
        const newIntentRows = await Promise.all(
          newIntentIds.map(async intentId => ({
            systemId: await this.idGeneration.getNextId(fileSystemId),
            controlPortSystemId: portId,
            intentId,
          })),
        );
        await repo.createIntents(newIntentRows);
      }

      modifiedLinks.push(mapControlLink({
        systemId: controlLink.systemId,
        peerNodeASystemId: controlLink.peerNodeASystemId,
        peerNodeBSystemId: controlLink.peerNodeBSystemId,
        nodeAPortSystemId: controlLink.nodeAPortSystemId,
        nodeBPortSystemId: controlLink.nodeBPortSystemId,
        heapId: controlLink.heapId,
        linkType: controlLink.linkType,
      }));
    }

    // FR-PCL-04: update heapId
    if (command.heapId !== undefined) {
      if (command.heapId !== controlLink.heapId) {
        await repo.updateHeapId(command.controlLinkSystemId, command.heapId);

        modifiedLinks.push(mapControlLink({
          systemId: controlLink.systemId,
          peerNodeASystemId: controlLink.peerNodeASystemId,
          peerNodeBSystemId: controlLink.peerNodeBSystemId,
          nodeAPortSystemId: controlLink.nodeAPortSystemId,
          nodeBPortSystemId: controlLink.nodeBPortSystemId,
          heapId: command.heapId,
          linkType: controlLink.linkType,
        }));
      }
    }

    return modifiedLinks;
  }
}
