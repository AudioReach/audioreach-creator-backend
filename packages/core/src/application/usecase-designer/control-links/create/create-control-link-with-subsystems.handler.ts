/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import {NodeType} from '../../../../domain/entities/usecase-data/node/node.js';
import {
  ResourceNotFoundException,
  DomainRuleViolationException,
  DuplicateLinkException,
} from '../../../../shared/exceptions/index.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {SubsystemControlLink} from '../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import {ControlChainResolutionService} from '../../../../domain/services/subsystem-control-links/control-chain-resolution.service.js';
import {DEFAULT_CONTAINER_HEAP_ID} from '../../../../domain/entities/definitions/spf-ids.js';
import type {CreateControlLinkWithSubsystemsCommand} from './create-control-link-with-subsystems.command.js';
import {type CreateControlLinkResult} from './create-control-link-with-subsystems.command.js';
import {
  ControlLinkCreationHandler,
  type ControlLinkCreationCommand,
  type ControlLinkCreationContext,
  type ControlLinkNode,
} from './create-control-link-base.handler.js';
import {SubsystemBoundaryPathService} from '../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';

export class CreateControlLinkWithSubsystemsHandler
  extends ControlLinkCreationHandler<CreateControlLinkResult>
  implements
    CommandHandler<
      CreateControlLinkWithSubsystemsCommand,
      CreateControlLinkResult
    >
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
    const subsystem = await this.uow
      .getSubsystemRepository()
      .getSubsystem(systemId, fileSystemId);
    if (!subsystem)
      throw new ResourceNotFoundException(`Node ${systemId} not found`);
    return {
      type: NodeType.Subsystem,
      subgraphId: 0,
      parentSystemId: subsystem.parentSystemId ?? undefined,
    };
  }

  protected async validateMode(
    command: ControlLinkCreationCommand,
    _nodeA: ControlLinkNode,
    _nodeB: ControlLinkNode,
    fileSystemId: number,
  ): Promise<void> {
    await this.checkSubsystemPortUniqueness(command, fileSystemId);
  }

  private async checkSubsystemPortUniqueness(
    command: ControlLinkCreationCommand,
    fileSystemId: number,
  ): Promise<void> {
    const subsystems = await this.uow
      .getSubsystemRepository()
      .getSubsystems(fileSystemId);
    const subsystemIds = new Set(subsystems.map(s => s.systemId));
    const topologyRows = await this.uow
      .getSubsystemRepository()
      .getAllNodesWithParents(fileSystemId);
    const parentById = new Map(
      topologyRows.map(n => [n.systemId, n.parentSystemId]),
    );
    const segments = await this.uow
      .getControlLinkRepository()
      .getAllSubsystemControlLinks(fileSystemId);
    const isInside = (owner: number, other: number): boolean => {
      let current = other;
      const visited = new Set<number>();
      while (!visited.has(current)) {
        if (current === owner) return true;
        visited.add(current);
        const parent = parentById.get(current);
        if (parent == null) return false;
        current = parent;
      }
      return false;
    };
    const check = (owner: number, port: number, other: number): void => {
      if (!subsystemIds.has(owner)) return;
      const side = isInside(owner, other) ? 'inner' : 'outer';
      for (const existing of segments.filter(
        segment =>
          segment.nodeAPortSystemId === port ||
          segment.nodeBPortSystemId === port,
      )) {
        const existingOther =
          existing.nodeAPortSystemId === port
            ? existing.peerNodeBSystemId
            : existing.peerNodeASystemId;
        if ((isInside(owner, existingOther) ? 'inner' : 'outer') === side)
          throw new DomainRuleViolationException([
            IssueFactory.validationError(
              `Subsystem port ${port} already has an ${side} connection`,
            ),
          ]);
      }
    };
    check(
      command.peerNodeASystemId,
      command.nodeAPortSystemId,
      command.peerNodeBSystemId,
    );
    check(
      command.peerNodeBSystemId,
      command.nodeBPortSystemId,
      command.peerNodeASystemId,
    );
  }

  protected async createForMode(
    command: ControlLinkCreationCommand,
    context: ControlLinkCreationContext,
    intents: number[],
  ): Promise<CreateControlLinkResult> {
    if (
      context.nodeA.type === NodeType.Module &&
      context.nodeB.type === NodeType.Module
    ) {
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
      const link = await this.createModuleControlLink(
        command,
        context,
        intents,
        {segments},
      );
      return {
        systemId: String(link.systemId),
        peerNodeASystemId: String(command.peerNodeASystemId),
        peerNodeBSystemId: String(command.peerNodeBSystemId),
      };
    }
    const repository = this.uow.getControlLinkRepository();
    const segmentId = await this.idGeneration.getNextId(context.fileSystemId);
    const first = command.nodeAPortSystemId < command.nodeBPortSystemId;
    const segment = new SubsystemControlLink(
      segmentId,
      first ? command.peerNodeASystemId : command.peerNodeBSystemId,
      first ? command.peerNodeBSystemId : command.peerNodeASystemId,
      first ? command.nodeAPortSystemId : command.nodeBPortSystemId,
      first ? command.nodeBPortSystemId : command.nodeAPortSystemId,
      null,
      context.fileSystemId,
      command.linkType,
      DEFAULT_CONTAINER_HEAP_ID,
    );
    const [allSegments, routeTopology] = await Promise.all([
      repository.getAllSubsystemControlLinks(context.fileSystemId),
      this.uow
        .getSubsystemRepository()
        .getAllNodesWithParents(context.fileSystemId),
    ]);
    const nodeTypes = new Map(routeTopology.map(n => [n.systemId, n.type]));
    nodeTypes.set(command.peerNodeASystemId, context.nodeA.type);
    nodeTypes.set(command.peerNodeBSystemId, context.nodeB.type);
    const resolution = ControlChainResolutionService.resolve({
      unresolvedSubsystemlinks: [
        ...allSegments.filter(
          (link: SubsystemControlLink) => link.controlLinkSystemId === null,
        ),
        segment,
      ],
      nodeTypeMap: nodeTypes,
    });
    const completed = resolution.completeChains.find(chain =>
      chain.ssLinksSystemIds.includes(segmentId),
    );
    if (!completed) {
      await repository.createSubsystemControlLink(segment);
      if (intents.length > 0)
        await this.propagateIntents(
          segment.nodeAPortSystemId,
          segment.nodeBPortSystemId,
          segment.peerNodeASystemId,
          segment.peerNodeBSystemId,
          context.nodeA.type,
          context.nodeB.type,
          intents,
          context.fileSystemId,
          [segment],
        );
      return {
        systemId: String(segment.systemId),
        peerNodeASystemId: String(command.peerNodeASystemId),
        peerNodeBSystemId: String(command.peerNodeBSystemId),
      };
    }
    const [terminalA, terminalB] = await Promise.all([
      this.resolveNode(completed.peerAModuleSystemId, context.fileSystemId),
      this.resolveNode(completed.peerBModuleSystemId, context.fileSystemId),
    ]);
    await this.validateLinkScope(
      command,
      terminalA,
      terminalB,
      context.fileSystemId,
    );
    const existing = await repository.findActiveByPortPair(
      completed.peerAPortSystemId,
      completed.peerBPortSystemId,
      context.fileSystemId,
    );
    if (existing)
      throw new DuplicateLinkException(
        `A control link already exists between ports ${completed.peerAPortSystemId} and ${completed.peerBPortSystemId}`,
      );
    const moduleContext: ControlLinkCreationContext = {
      ...context,
      nodeA: terminalA,
      nodeB: terminalB,
      canonicalPortA: completed.peerAPortSystemId,
      canonicalPortB: completed.peerBPortSystemId,
      canonicalNodeA: completed.peerAModuleSystemId,
      canonicalNodeB: completed.peerBModuleSystemId,
      canonicalNodeTypeA: NodeType.Module,
      canonicalNodeTypeB: NodeType.Module,
    };
    const link = await this.createModuleControlLink(
      command,
      moduleContext,
      intents,
    );
    segment.controlLinkSystemId = Number(link.systemId);
    await repository.createSubsystemControlLink(segment);
    await repository.associateSubsystemControlLinks(
      completed.ssLinksSystemIds.filter(id => id !== segmentId),
      Number(link.systemId),
    );
    return {
      systemId: String(link.systemId),
      peerNodeASystemId: String(command.peerNodeASystemId),
      peerNodeBSystemId: String(command.peerNodeBSystemId),
    };
  }

  async handle(
    command: CreateControlLinkWithSubsystemsCommand,
  ): Promise<CreateControlLinkResult> {
    return this.execute(command);
  }
}
