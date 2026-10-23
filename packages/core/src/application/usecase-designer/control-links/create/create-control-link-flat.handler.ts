/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {ComponentCollectionDto} from '../../usecase/dto/component-collection-dto.js';
import {mapControlLink} from '../../usecase/dto/component-collection-dto.js';
import {NodeType} from '../../../../domain/entities/usecase-data/node/node.js';
import {
  ResourceNotFoundException,
  DomainRuleViolationException,
} from '../../../../shared/exceptions/index.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {CreateControlLinkCommand} from './create-control-link.command.js';
import {
  ControlLinkCreationHandler,
  type ControlLinkCreationCommand,
  type ControlLinkCreationContext,
  type ControlLinkNode,
} from './create-control-link-base.handler.js';
import {SubsystemBoundaryPathService} from '../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';

export class CreateControlLinkFlatHandler
  extends ControlLinkCreationHandler
  implements CommandHandler<CreateControlLinkCommand, ComponentCollectionDto>
{
  protected async resolveNode(
    systemId: number,
    fileSystemId: number,
  ): Promise<ControlLinkNode> {
    const module = await this.uow
      .getModuleRepository()
      .findModuleForControlLink(systemId, fileSystemId);
    if (module)
      return {
        type: NodeType.Module,
        subgraphId: module.subgraphSystemId,
        parentSystemId: module.parentSystemId ?? undefined,
      };
    if (
      await this.uow
        .getSubsystemRepository()
        .subsystemExists(systemId, fileSystemId)
    )
      throw new DomainRuleViolationException([
        IssueFactory.validationError(
          `Node ${systemId} is a subsystem; flat control-link view accepts module nodes only`,
        ),
      ]);
    throw new ResourceNotFoundException(`Node ${systemId} not found`);
  }

  protected async validateMode(
    _command: ControlLinkCreationCommand,
    _nodeA: ControlLinkNode,
    _nodeB: ControlLinkNode,
    _fileSystemId: number,
  ): Promise<void> {}

  protected async createForMode(
    command: ControlLinkCreationCommand,
    context: ControlLinkCreationContext,
    intents: number[],
  ): Promise<ComponentCollectionDto> {
    const topology = await this.uow
      .getSubsystemRepository()
      .getAllNodesWithParents(context.fileSystemId);
    const nodeParentMap = new Map(
      topology.map(n => [n.systemId, n.parentSystemId]),
    );
    const segments = SubsystemBoundaryPathService.compute({
      sourceNodeSystemId: command.peerNodeASystemId,
      destinationNodeSystemId: command.peerNodeBSystemId,
      nodeParentMap,
    });
    const link = await this.createModuleControlLink(command, context, intents, {
      segments,
    });
    return {
      spfModules: [],
      dataLinks: [],
      controlLinks: [mapControlLink(link)],
    };
  }

  async handle(
    command: CreateControlLinkCommand,
  ): Promise<ComponentCollectionDto> {
    return this.execute(command);
  }
}
