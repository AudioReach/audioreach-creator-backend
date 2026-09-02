/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {DeleteControlLinkCommand} from './delete-control-link.command.js';
import type {ControlLinkDto} from '../../usecase/dto/component-collection-dto.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {NodeType} from '../../../../domain/entities/usecase-data/node/node.js';
import {ControlIntentPropagationService} from '../../../../domain/services/subsystem-control-links/control-intent-propagation.service.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';
import {CONNECTION_TYPE} from '../../../ports/persistence/query-services/link/control-link-read-model.js';
import {mapControlLink} from '../../usecase/dto/component-collection-dto.js';

export type DeleteControlLinkResult = ControlLinkDto;

export class DeleteControlLinkHandler implements CommandHandler<
  DeleteControlLinkCommand,
  DeleteControlLinkResult
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: DeleteControlLinkCommand): Promise<DeleteControlLinkResult> {
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

  private async doHandle(command: DeleteControlLinkCommand): Promise<DeleteControlLinkResult> {
    const ctx = this.uow.getWriteContext();
    const fileSystemId = ctx.session.fileSystemId;
    const repo = this.uow.getControlLinkRepository();

    // FR-DCL-02: link must exist and be non-deleted
    const controlLink = await repo.findBySystemId(command.controlLinkSystemId, fileSystemId);
    if (controlLink === null) {
      throw new ResourceNotFoundException(`ControlLink ${command.controlLinkSystemId} not found`);
    }

    // Derive connectionType for the response snapshot (FR-DCL-05)
    const [startIsModule, endIsModule] = await Promise.all([
      this.queryServices.spfModuleQueryService.findOne(controlLink.peerNodeASystemId, fileSystemId).then(() => true).catch(() => false),
      this.queryServices.spfModuleQueryService.findOne(controlLink.peerNodeBSystemId, fileSystemId).then(() => true).catch(() => false),
    ]);
    let connectionType: typeof CONNECTION_TYPE[keyof typeof CONNECTION_TYPE];
    if (startIsModule && endIsModule) connectionType = CONNECTION_TYPE.ModuleModule;
    else if (startIsModule) connectionType = CONNECTION_TYPE.ModuleSubsystem;
    else if (endIsModule) connectionType = CONNECTION_TYPE.SubsystemModule;
    else connectionType = CONNECTION_TYPE.SubsystemSubsystem;

    // FR-DCL-05: snapshot before deletion for undo support
    const snapshot = mapControlLink({
      systemId: controlLink.systemId,
      peerNodeASystemId: controlLink.peerNodeASystemId,
      peerNodeBSystemId: controlLink.peerNodeBSystemId,
      nodeAPortSystemId: controlLink.nodeAPortSystemId,
      nodeBPortSystemId: controlLink.nodeBPortSystemId,
      heapId: controlLink.heapId,
      linkType: controlLink.linkType,
      connectionType,
      isInterUsecase: controlLink.linkType === 'INTER_USECASE',
      parentId: null,
    });

    // FR-DCL-03: soft delete
    await repo.softDeleteControlLink(command.controlLinkSystemId);

    // FR-DCL-04: port intent cleanup after deletion
    const portAId = controlLink.nodeAPortSystemId;
    const portBId = controlLink.nodeBPortSystemId;

    await this.cleanupPortIntents(portAId, controlLink.peerNodeASystemId, fileSystemId);
    await this.cleanupPortIntents(portBId, controlLink.peerNodeBSystemId, fileSystemId);

    return snapshot;
  }

  private async cleanupPortIntents(
    portSystemId: number,
    nodeSystemId: number,
    fileSystemId: number,
  ): Promise<void> {
    const repo = this.uow.getControlLinkRepository();

    // Check if this port has any remaining non-deleted links
    const remainingLinks = await repo.getLinksByPortSystemIds([portSystemId], fileSystemId);
    if (remainingLinks.length > 0) return; // port still has links — no cleanup needed

    // Determine node type
    const moduleResult = await this.queryServices.spfModuleQueryService
      .findOne(nodeSystemId, fileSystemId)
      .catch(() => null);

    const isModule = moduleResult !== null;

    if (isModule) {
      // Module port with no remaining links: reset to full supported set from definition
      const def = await this.queryServices.spfModuleDefinitionQueryService.getDefinition(
        moduleResult!.definitionSystemId,
        fileSystemId,
        CONFIGURATION_INCLUDES.FullDetails,
      );

      if (def.kind === RESULT_KIND.Fail) return;

      const existingIntents = await repo.getAllocatedIntentIds(portSystemId, fileSystemId);
      if (existingIntents.length > 0) {
        await repo.deleteIntents(existingIntents.map(e => e.intentSystemId), portSystemId);
      }

      // Re-populate with all supported intents from definition
      const portResult = await this.queryServices.spfModuleQueryService.nodeQueryService.getControlPorts(nodeSystemId, fileSystemId);
      if (portResult.kind === RESULT_KIND.Fail) return;

      const port = portResult.data.find(p => p.systemId === portSystemId);
      if (!port) return;

      const defData = def.data;
      let supportedIntentIds: number[] = [];

      const staticPort = (defData.staticControlPorts ?? []).find(sp => sp.portId === port.portId);
      if (staticPort) {
        supportedIntentIds = (staticPort.staticIntents ?? []).map(i => i.intentId);
      } else {
        supportedIntentIds = (defData.dynamicIntents ?? []).map(i => i.intentId);
      }

      if (supportedIntentIds.length > 0) {
        const newIntents = await Promise.all(
          supportedIntentIds.map(async intentId => ({
            systemId: await this.idGeneration.getNextId(fileSystemId),
            controlPortSystemId: portSystemId,
            intentId,
          })),
        );
        await repo.createIntents(newIntents);
      }
    } else {
      // Subsystem port: use ControlIntentPropagationService.findPortsToClear
      const allScls = await repo.getAllSubsystemControlLinks(fileSystemId);

      const remainingScls = allScls.map(scl => ({
        peerNodeASystemId: scl.peerNodeASystemId,
        peerNodeBSystemId: scl.peerNodeBSystemId,
        nodeAPortSystemId: scl.nodeAPortSystemId,
        nodeBPortSystemId: scl.nodeBPortSystemId,
      }));

      const clearResult = ControlIntentPropagationService.findPortsToClear({
        remainingSubsystemControlLinks: remainingScls,
        nodeTypeMap: new Map([[nodeSystemId, NodeType.Subsystem]]),
        deletedSubsystemControlLink: {
          peerNodeASystemId: nodeSystemId,
          peerNodeBSystemId: nodeSystemId,
        },
      });

      for (const clearPortId of clearResult.portsToClear) {
        const existingIntents = await repo.getAllocatedIntentIds(clearPortId, fileSystemId);
        if (existingIntents.length > 0) {
          await repo.deleteIntents(existingIntents.map(e => e.intentSystemId), clearPortId);
        }
      }
    }
  }
}
