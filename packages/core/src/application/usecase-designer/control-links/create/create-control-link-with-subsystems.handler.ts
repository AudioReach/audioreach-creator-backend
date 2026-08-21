/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {ComponentCollectionWithSubsystemsDto} from '../../usecase/dto/component-collection-dto.js';
import {mapControlLink} from '../../usecase/dto/component-collection-dto.js';
import type {SubsystemReadModel} from '../../../ports/persistence/query-services/subsystem/subsystem-read-model.js';
import {NodeType} from '../../../../domain/entities/usecase-data/node/node.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/index.js';
import {DomainRuleViolationException} from '../../../../shared/exceptions/index.js';
import {DuplicateLinkException} from '../../../../shared/exceptions/index.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {SubsystemControlLink} from '../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import {ControlChainResolutionService} from '../../../../domain/services/subsystem-control-links/control-chain-resolution.service.js';
import {DEFAULT_CONTAINER_HEAP_ID} from '../../../file-operations/shared/constants/spf-ids.js';
import type {CreateControlLinkWithSubsystemsCommand} from './create-control-link-with-subsystems.command.js';
import {
  ControlLinkCreationHandler,
  type ControlLinkCreationCommand,
  type ControlLinkCreationContext,
  type ControlLinkNode,
} from './create-control-link-base.handler.js';
import {SubsystemBoundaryPathService} from '../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';

export class CreateControlLinkWithSubsystemsHandler
  extends ControlLinkCreationHandler
  implements
    CommandHandler<
      CreateControlLinkWithSubsystemsCommand,
      ComponentCollectionWithSubsystemsDto
    >
{
  protected async resolveNode(
    systemId: number,
    fileSystemId: number,
  ): Promise<ControlLinkNode> {
    const module = await this.queryServices.spfModuleQueryService.getSpfModule(
      systemId,
      fileSystemId,
    );
    if (module.kind !== RESULT_KIND.Fail)
      return {
        type: NodeType.Module,
        subgraphId: module.data.subgraphSystemId,
        parentSystemId: module.data.parentSystemId,
      };
    const subsystems =
      await this.queryServices.subsystemQueryService.findAll(fileSystemId);
    const subsystem =
      subsystems.kind === RESULT_KIND.Fail
        ? undefined
        : subsystems.data.find(candidate => candidate.systemId === systemId);
    if (!subsystem)
      throw new ResourceNotFoundException(`Node ${systemId} not found`);
    return {
      type: NodeType.Subsystem,
      subgraphId: 0,
      parentSystemId: subsystem.parentSystemId,
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
    const result =
      await this.queryServices.subsystemQueryService.findAll(fileSystemId);
    if (result.kind === RESULT_KIND.Fail)
      throw new Error('Unable to load subsystem topology');
    const subsystemIds = new Set(result.data.map(subsystem => subsystem.systemId));
    const parentById = await this.uow
      .getSubsystemRepository()
      .getAllNodesWithParents(fileSystemId);
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
    const check = async (
      owner: number,
      port: number,
      other: number,
    ): Promise<void> => {
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
    await check(
      command.peerNodeASystemId,
      command.nodeAPortSystemId,
      command.peerNodeBSystemId,
    );
    await check(
      command.peerNodeBSystemId,
      command.nodeBPortSystemId,
      command.peerNodeASystemId,
    );
  }

  protected async createForMode(
    command: ControlLinkCreationCommand,
    context: ControlLinkCreationContext,
    intents: number[],
  ): Promise<ComponentCollectionWithSubsystemsDto> {
    if (
      context.nodeA.type === NodeType.Module &&
      context.nodeB.type === NodeType.Module
    ) {
      const nodeParentMap = await this.uow
        .getSubsystemRepository()
        .getAllNodesWithParents(context.fileSystemId);
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
      return this.hierarchyResponse(command, context, link);
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
    const route = await repository.findSubsystemControlRouteContext(
      context.fileSystemId,
    );
    const nodeTypes = new Map(route.nodeTypeBySystemId);
    nodeTypes.set(command.peerNodeASystemId, context.nodeA.type);
    nodeTypes.set(command.peerNodeBSystemId, context.nodeB.type);
    const resolution = ControlChainResolutionService.resolve({
      unresolvedSubsystemlinks: [
        ...route.subsystemControlLinks.filter(
          link => link.controlLinkSystemId === null,
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
      return this.hierarchyResponse(command, context, {
        systemId: segment.systemId,
        peerNodeASystemId: segment.peerNodeASystemId,
        peerNodeBSystemId: segment.peerNodeBSystemId,
        nodeAPortSystemId: segment.nodeAPortSystemId,
        nodeBPortSystemId: segment.nodeBPortSystemId,
        heapId: command.heapId,
        linkType: segment.linkType,
        subsystemControlLinks: [segment],
      });
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
    return this.hierarchyResponse(command, context, {
      ...link,
      subsystemControlLinks: [
        segment,
        ...route.subsystemControlLinks.filter(
          candidate =>
            candidate.systemId !== segmentId &&
            completed.ssLinksSystemIds.includes(candidate.systemId),
        ),
      ],
    });
  }

  async handle(
    command: CreateControlLinkWithSubsystemsCommand,
  ): Promise<ComponentCollectionWithSubsystemsDto> {
    return (await this.execute(
      command,
    )) as ComponentCollectionWithSubsystemsDto;
  }

  private async hierarchyResponse(
    _command: ControlLinkCreationCommand,
    context: ControlLinkCreationContext,
    link: Parameters<typeof mapControlLink>[0] & {
      subsystemControlLinks?: SubsystemControlLink[];
    },
  ): Promise<ComponentCollectionWithSubsystemsDto> {
    const segments = link.subsystemControlLinks ?? [];
    const nodeParentMap = await this.uow
      .getSubsystemRepository()
      .getAllNodesWithParents(context.fileSystemId);
    const response = {
      spfModules: [],
      dataLinks: [],
      controlLinks: [],
      subsystems: [] as ComponentCollectionWithSubsystemsDto['subsystems'],
    };
    const result = await this.queryServices.subsystemQueryService.findAll(
      this.uow.getWriteContext().session.fileSystemId,
    );
    if (result.kind === RESULT_KIND.Fail) return response;
    const byId = new Map(
      result.data.map(subsystem => [subsystem.systemId, subsystem]),
    );
    const included = new Set<number>();
    for (const endpoint of segments.flatMap(segment => [
      segment.peerNodeASystemId,
      segment.peerNodeBSystemId,
    ])) {
      let current: number | undefined = endpoint;
      while (
        current !== undefined &&
        byId.has(current) &&
        !included.has(current)
      ) {
        included.add(current);
        current = byId.get(current)?.parentSystemId;
      }
    }
    const mapSegment = (segment: SubsystemControlLink) =>
      mapControlLink({
        systemId: segment.systemId,
        peerNodeASystemId: segment.peerNodeASystemId,
        peerNodeBSystemId: segment.peerNodeBSystemId,
        nodeAPortSystemId: segment.nodeAPortSystemId,
        nodeBPortSystemId: segment.nodeBPortSystemId,
        heapId: 1,
        linkType: segment.linkType,
      });
    const linksAtLevel = (parentSystemId?: number) => {
      const visible = new Set<number>(
        [...nodeParentMap.entries()]
          .filter(([, parent]) =>
            parentSystemId === undefined
              ? parent === null
              : parent === parentSystemId,
          )
          .map(([nodeId]) => nodeId),
      );
      if (parentSystemId !== undefined) visible.add(parentSystemId);
      return segments
        .filter(
          segment =>
            visible.has(segment.peerNodeASystemId) &&
            visible.has(segment.peerNodeBSystemId),
        )
        .map(mapSegment);
    };
    const build = (
      parentSystemId?: number,
    ): ComponentCollectionWithSubsystemsDto['subsystems'] =>
      result.data
        .filter(
          subsystem =>
            included.has(subsystem.systemId) &&
            subsystem.parentSystemId === parentSystemId,
        )
        .map(subsystem =>
          this.mapSubsystem(subsystem, build, linksAtLevel(subsystem.systemId)),
        );
    return {...response, controlLinks: linksAtLevel(), subsystems: build()};
  }

  private mapSubsystem(
    subsystem: SubsystemReadModel,
    children: (
      parentSystemId?: number,
    ) => ComponentCollectionWithSubsystemsDto['subsystems'],
    controlLinks: ComponentCollectionWithSubsystemsDto['controlLinks'],
  ): ComponentCollectionWithSubsystemsDto['subsystems'][number] {
    return {
      systemId: String(subsystem.systemId),
      name: subsystem.name,
      filteredKeys: subsystem.filteredKeys.map(key => ({
        systemId: String(key.systemId),
        naturalId: key.naturalId,
        name: key.name,
        description: key.description,
      })),
      children: {
        spfModules: [],
        dataLinks: [],
        controlLinks,
        subsystems: children(subsystem.systemId),
      },
    };
  }
}
