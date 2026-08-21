/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ControlLinkType} from '../../../../domain/entities/usecase-data/links/control-link-type.js';
import type {ComponentCollectionDto} from '../../usecase/dto/component-collection-dto.js';
import {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import {SubsystemControlLink} from '../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import {CONTROL_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/control-link-type.js';
import {
  ResourceNotFoundException,
  DomainRuleViolationException,
  DuplicateLinkException,
} from '../../../../shared/exceptions/index.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';
import {NodeType} from '../../../../domain/entities/usecase-data/node/node.js';
import {mapControlLink} from '../../usecase/dto/component-collection-dto.js';
import {buildControlTraversalEntities} from './build-control-traversal-entities.js';
import {collectConnectedControlPorts} from './collect-connected-control-ports.js';
import type {SegmentDescriptor} from '../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';

export type ControlLinkCreationCommand = {
  readonly linkType: ControlLinkType;
  readonly peerNodeASystemId: number;
  readonly nodeAPortSystemId: number;
  readonly peerNodeBSystemId: number;
  readonly nodeBPortSystemId: number;
  readonly heapId: number;
};

export type ControlLinkNode = {
  type: (typeof NodeType)[keyof typeof NodeType];
  subgraphId: number;
  parentSystemId?: number;
};

export type ControlLinkCreationContext = {
  readonly fileSystemId: number;
  readonly nodeA: ControlLinkNode;
  readonly nodeB: ControlLinkNode;
  readonly portA: {
    naturalId: number;
    allocatedIntents: readonly {naturalId: number}[];
    totalLinksAtPort: number;
  };
  readonly portB: {
    naturalId: number;
    allocatedIntents: readonly {naturalId: number}[];
    totalLinksAtPort: number;
  };
  readonly canonicalPortA: number;
  readonly canonicalPortB: number;
  readonly canonicalNodeA: number;
  readonly canonicalNodeB: number;
  readonly canonicalNodeTypeA: (typeof NodeType)[keyof typeof NodeType];
  readonly canonicalNodeTypeB: (typeof NodeType)[keyof typeof NodeType];
};

export abstract class ControlLinkCreationHandler {
  constructor(
    protected readonly uow: UnitOfWork,
    protected readonly idGeneration: IdGenerationPort,
    protected readonly queryServices: QueryServices,
  ) {}

  protected abstract resolveNode(
    systemId: number,
    fileSystemId: number,
  ): Promise<ControlLinkNode>;

  protected abstract validateMode(
    command: ControlLinkCreationCommand,
    nodeA: ControlLinkNode,
    nodeB: ControlLinkNode,
    fileSystemId: number,
  ): Promise<void>;

  protected abstract createForMode(
    command: ControlLinkCreationCommand,
    context: ControlLinkCreationContext,
    intents: number[],
  ): Promise<ComponentCollectionDto>;

  protected async createModuleControlLink(
    command: ControlLinkCreationCommand,
    context: ControlLinkCreationContext,
    intents: number[],
    traversal?: {
      segments: SegmentDescriptor[];
    },
  ): Promise<
    Parameters<typeof mapControlLink>[0] & {
      subsystemControlLinks: SubsystemControlLink[];
    }
  > {
    const repository = this.uow.getControlLinkRepository();
    const deleted = await repository.findSoftDeletedByPortPair(
      context.canonicalPortA,
      context.canonicalPortB,
      context.fileSystemId,
    );
    const systemId =
      deleted?.systemId ??
      (await this.idGeneration.getNextId(context.fileSystemId));
    const effectiveLinkType = deleted?.linkType ?? command.linkType;
    const link = new ControlLink(
      systemId,
      context.fileSystemId,
      context.canonicalNodeA,
      context.canonicalNodeB,
      context.canonicalPortA,
      context.canonicalPortB,
      command.heapId,
      effectiveLinkType,
      context.nodeA.subgraphId,
      context.nodeB.subgraphId,
    );
    const traversalEntities = traversal
      ? await buildControlTraversalEntities(
          traversal.segments,
          command.nodeAPortSystemId,
          command.nodeBPortSystemId,
          systemId,
           effectiveLinkType,
          context.fileSystemId,
          this.idGeneration,
          await this.getBoundaryNaturalIdStarts(
            traversal.segments,
            context.fileSystemId,
          ),
        )
      : undefined;
    if (traversalEntities) {
      link.subsystemControlLinks.push(
        ...traversalEntities.subsystemControlLinks,
      );
      await this.uow
        .getSubsystemRepository()
        .createControlPorts(traversalEntities.controlPorts);
    }
    if (deleted) {
      await repository.reactivateControlLink(link);
      if (traversalEntities) {
        for (const segment of traversalEntities.subsystemControlLinks)
          await repository.createSubsystemControlLink(segment);
      }
    } else await repository.createControlLink(link);
    if (intents.length > 0)
      await this.propagateIntents(
        context.canonicalPortA,
        context.canonicalPortB,
        context.canonicalNodeA,
        context.canonicalNodeB,
        context.canonicalNodeTypeA,
        context.canonicalNodeTypeB,
        intents,
        context.fileSystemId,
        traversalEntities?.subsystemControlLinks ?? [],
      );
    return {
      systemId,
      peerNodeASystemId: context.canonicalNodeA,
      peerNodeBSystemId: context.canonicalNodeB,
      nodeAPortSystemId: context.canonicalPortA,
      nodeBPortSystemId: context.canonicalPortB,
      heapId: command.heapId,
      linkType: link.linkType,
      subsystemControlLinks: traversalEntities?.subsystemControlLinks ?? [],
    };
  }

  private async getBoundaryNaturalIdStarts(
    segments: SegmentDescriptor[],
    fileSystemId: number,
  ): Promise<Map<number, number>> {
    const nodes = new Set<number>();
    for (const segment of segments) {
      if (segment.sourceBoundaryPortType !== null)
        nodes.add(segment.sourceNodeSystemId);
      if (segment.destBoundaryPortType !== null)
        nodes.add(segment.destinationNodeSystemId);
    }
    const starts = new Map<number, number>();
    for (const nodeId of nodes) {
      const result = await this.queryServices.nodeQueryService.getControlPorts(
        nodeId,
        fileSystemId,
      );
      if (result.kind === RESULT_KIND.Fail)
        throw new Error(
          `Unable to load control ports for boundary node ${nodeId}`,
        );
      const max = result.data.reduce(
        (value, port) => Math.max(value, port.naturalId),
        0,
      );
      starts.set(nodeId, max);
    }
    return starts;
  }

  protected async execute(
    command: ControlLinkCreationCommand,
  ): Promise<ComponentCollectionDto> {
    await this.uow.startTransaction();
    try {
      const result = await this.create(command);
      await this.uow.applyCachedActions();
      await this.uow.commit();
      return result;
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async create(
    command: ControlLinkCreationCommand,
  ): Promise<ComponentCollectionDto> {
    const fileSystemId = this.uow.getWriteContext().session.fileSystemId;
    if (!Number.isInteger(command.heapId) || command.heapId < 1) {
      throw new DomainRuleViolationException([
        IssueFactory.validationError('heapId must be a positive integer'),
      ]);
    }
    if (command.peerNodeASystemId === command.peerNodeBSystemId) {
      throw new DomainRuleViolationException([
        IssueFactory.validationError(
          'A control link cannot connect a node to itself',
        ),
      ]);
    }

    const [nodeA, nodeB] = await Promise.all([
      this.resolveNode(command.peerNodeASystemId, fileSystemId),
      this.resolveNode(command.peerNodeBSystemId, fileSystemId),
    ]);

    const [portAResult, portBResult] = await Promise.all([
      this.queryServices.nodeQueryService.getControlPorts(
        command.peerNodeASystemId,
        fileSystemId,
      ),
      this.queryServices.nodeQueryService.getControlPorts(
        command.peerNodeBSystemId,
        fileSystemId,
      ),
    ]);
    if (portAResult.kind === RESULT_KIND.Fail)
      throw new ResourceNotFoundException(
        `Control ports for node ${command.peerNodeASystemId} not found`,
      );
    if (portBResult.kind === RESULT_KIND.Fail)
      throw new ResourceNotFoundException(
        `Control ports for node ${command.peerNodeBSystemId} not found`,
      );
    const portA = portAResult.data.find(
      port => port.systemId === command.nodeAPortSystemId,
    );
    const portB = portBResult.data.find(
      port => port.systemId === command.nodeBPortSystemId,
    );
    if (!portA) {
      if (
        await this.uow
          .getSubsystemRepository()
          .controlPortExists(command.nodeAPortSystemId, fileSystemId)
      )
        throw new DomainRuleViolationException([
          IssueFactory.validationError(
            `Control port ${command.nodeAPortSystemId} is not owned by node ${command.peerNodeASystemId}`,
          ),
        ]);
      throw new ResourceNotFoundException(
        `Control port ${command.nodeAPortSystemId} not found`,
      );
    }
    if (!portB) {
      if (
        await this.uow
          .getSubsystemRepository()
          .controlPortExists(command.nodeBPortSystemId, fileSystemId)
      )
        throw new DomainRuleViolationException([
          IssueFactory.validationError(
            `Control port ${command.nodeBPortSystemId} is not owned by node ${command.peerNodeBSystemId}`,
          ),
        ]);
      throw new ResourceNotFoundException(
        `Control port ${command.nodeBPortSystemId} not found`,
      );
    }

    const [canonicalPortA, canonicalPortB, canonicalNodeA, canonicalNodeB] =
      command.nodeAPortSystemId < command.nodeBPortSystemId
        ? [
            command.nodeAPortSystemId,
            command.nodeBPortSystemId,
            command.peerNodeASystemId,
            command.peerNodeBSystemId,
          ]
        : [
            command.nodeBPortSystemId,
            command.nodeAPortSystemId,
            command.peerNodeBSystemId,
            command.peerNodeASystemId,
          ];
    const [canonicalNodeTypeA, canonicalNodeTypeB] =
      command.nodeAPortSystemId < command.nodeBPortSystemId
        ? [nodeA.type, nodeB.type]
        : [nodeB.type, nodeA.type];

    const repository = this.uow.getControlLinkRepository();
    if (
      await repository.findActiveByPortPair(
        canonicalPortA,
        canonicalPortB,
        fileSystemId,
      )
    ) {
      throw new DuplicateLinkException(
        `A control link already exists between ports ${canonicalPortA} and ${canonicalPortB}`,
      );
    }

    await this.validateLinkScope(command, nodeA, nodeB, fileSystemId);
    await this.validateMode(command, nodeA, nodeB, fileSystemId);
    const intents = await this.resolveIntents(
      command,
      nodeA,
      nodeB,
      portA,
      portB,
      fileSystemId,
    );
    await this.validateIntentSupport(intents, command, fileSystemId);
    return this.createForMode(
      command,
      {
        fileSystemId,
        nodeA,
        nodeB,
        portA,
        portB,
        canonicalPortA,
        canonicalPortB,
        canonicalNodeA,
        canonicalNodeB,
        canonicalNodeTypeA,
        canonicalNodeTypeB,
      },
      intents,
    );
  }

  protected async validateLinkScope(
    command: ControlLinkCreationCommand,
    nodeA: {type: (typeof NodeType)[keyof typeof NodeType]; subgraphId: number},
    nodeB: {type: (typeof NodeType)[keyof typeof NodeType]; subgraphId: number},
    fileSystemId: number,
  ): Promise<void> {
    if (nodeA.type !== NodeType.Module || nodeB.type !== NodeType.Module)
      return;
    if (command.linkType === CONTROL_LINK_TYPE.InterUsecase) {
      const usecases =
        await this.queryServices.useCaseQueryService.findUsecaseIdsBySubgraphIds(
          [nodeA.subgraphId, nodeB.subgraphId],
          fileSystemId,
        );
      const a = new Set(usecases.get(nodeA.subgraphId) ?? []);
      if ((usecases.get(nodeB.subgraphId) ?? []).some(id => a.has(id))) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError(
            'The endpoints share a use case and cannot be inter-usecase',
          ),
        ]);
      }
      return;
    }
    if (nodeA.subgraphId === nodeB.subgraphId) return;
    const usecases =
      await this.queryServices.useCaseQueryService.findUsecaseIdsBySubgraphIds(
        [nodeA.subgraphId, nodeB.subgraphId],
        fileSystemId,
      );
    const a = new Set(usecases.get(nodeA.subgraphId) ?? []);
    if (!(usecases.get(nodeB.subgraphId) ?? []).some(id => a.has(id))) {
      throw new DomainRuleViolationException([
        IssueFactory.validationError(
          'The endpoints belong to different use cases; use INTER_USECASE linkType',
        ),
      ]);
    }
  }

  private async resolveIntents(
    command: ControlLinkCreationCommand,
    nodeA: {type: (typeof NodeType)[keyof typeof NodeType]; subgraphId: number},
    nodeB: {type: (typeof NodeType)[keyof typeof NodeType]; subgraphId: number},
    portA: {
      naturalId: number;
      allocatedIntents: readonly {naturalId: number}[];
      totalLinksAtPort: number;
    },
    portB: {
      naturalId: number;
      allocatedIntents: readonly {naturalId: number}[];
      totalLinksAtPort: number;
    },
    fileSystemId: number,
  ): Promise<number[]> {
    const a = await this.resolvePortIntents(
      command.peerNodeASystemId,
      portA.naturalId,
      nodeA.type,
      portA,
      fileSystemId,
    );
    const b = await this.resolvePortIntents(
      command.peerNodeBSystemId,
      portB.naturalId,
      nodeB.type,
      portB,
      fileSystemId,
    );
    if (a.length === 0 && portA.totalLinksAtPort > 0) {
      throw new DomainRuleViolationException([
        IssueFactory.validationError(
          `No allocated intents exist on port ${command.nodeAPortSystemId}`,
        ),
      ]);
    }
    if (b.length === 0 && portB.totalLinksAtPort > 0) {
      throw new DomainRuleViolationException([
        IssueFactory.validationError(
          `No allocated intents exist on port ${command.nodeBPortSystemId}`,
        ),
      ]);
    }
    if (a.length === 0 && b.length === 0) {
      if (
        nodeA.type === NodeType.Subsystem &&
        nodeB.type === NodeType.Subsystem
      )
        return [];
      throw new DomainRuleViolationException([
        IssueFactory.validationError(
          'No intents can be resolved for the control link',
        ),
      ]);
    }
    if (a.length === 0) return b;
    if (b.length === 0) return a;
    const bSet = new Set(b);
    const intersection = a.filter(intentId => bSet.has(intentId));
    if (intersection.length === 0)
      throw new DomainRuleViolationException([
        IssueFactory.validationError(
          'The control-port intent intersection is empty',
        ),
      ]);
    return intersection;
  }

  private async resolvePortIntents(
    nodeId: number,
    portNaturalId: number,
    nodeType: (typeof NodeType)[keyof typeof NodeType],
    port: {
      allocatedIntents: readonly {naturalId: number}[];
      totalLinksAtPort: number;
    },
    fileSystemId: number,
  ): Promise<number[]> {
    if (port.totalLinksAtPort > 0)
      return port.allocatedIntents.map(intent => intent.naturalId);
    if (nodeType === NodeType.Subsystem) return [];
    const moduleResult =
      await this.queryServices.spfModuleQueryService.getSpfModule(
        nodeId,
        fileSystemId,
      );
    if (moduleResult.kind === RESULT_KIND.Fail) return [];
    const definition =
      await this.queryServices.spfModuleDefinitionQueryService.getDefinition(
        moduleResult.data.definitionSystemId,
        fileSystemId,
        CONFIGURATION_INCLUDES.FullDetails,
      );
    if (definition.kind === RESULT_KIND.Fail) return [];
    const staticPort = (definition.data.staticControlPorts ?? []).find(
      candidate => candidate.naturalId === portNaturalId,
    );
    if (staticPort)
      return (staticPort.staticIntents ?? []).map(intent => intent.naturalId);
    return (definition.data.dynamicIntents ?? []).map(
      intent => intent.naturalId,
    );
  }

  private async validateIntentSupport(
    intentIds: number[],
    command: ControlLinkCreationCommand,
    fileSystemId: number,
  ): Promise<void> {
    if (intentIds.length === 0) return;
    const repository = this.uow.getControlLinkRepository();
    const [controlLinks, segments] = await Promise.all([
      repository.getAllControlLinks(fileSystemId),
      repository.getAllSubsystemControlLinks(fileSystemId),
    ]);
    const portToNode = new Map<number, number>();
    const segmentPeers = new Map<number, number[]>();
    const add = (
      map: Map<number, number[]>,
      key: number,
      value: number,
    ): void => {
      map.set(key, [...(map.get(key) ?? []), value]);
    };
    for (const segment of segments) {
      portToNode.set(segment.nodeAPortSystemId, segment.peerNodeASystemId);
      portToNode.set(segment.nodeBPortSystemId, segment.peerNodeBSystemId);
      add(segmentPeers, segment.nodeAPortSystemId, segment.nodeBPortSystemId);
      add(segmentPeers, segment.nodeBPortSystemId, segment.nodeAPortSystemId);
    }
    for (const link of controlLinks) {
      portToNode.set(link.nodeAPortSystemId, link.peerNodeASystemId);
      portToNode.set(link.nodeBPortSystemId, link.peerNodeBSystemId);
      add(segmentPeers, link.nodeAPortSystemId, link.nodeBPortSystemId);
      add(segmentPeers, link.nodeBPortSystemId, link.nodeAPortSystemId);
    }
    portToNode.set(command.nodeAPortSystemId, command.peerNodeASystemId);
    portToNode.set(command.nodeBPortSystemId, command.peerNodeBSystemId);

    const queue = [command.nodeAPortSystemId, command.nodeBPortSystemId];
    const visited = new Set(queue);
    const moduleEndpoints = new Map<string, {nodeId: number; portId: number}>();
    while (queue.length > 0) {
      const portId = queue.shift()!;
      const nodeId = portToNode.get(portId);
      if (nodeId === undefined) continue;
      const module =
        await this.queryServices.spfModuleQueryService.getSpfModule(
          nodeId,
          fileSystemId,
        );
      if (module.kind !== RESULT_KIND.Fail)
        moduleEndpoints.set(`${nodeId}:${portId}`, {nodeId, portId});
      const neighbors = segmentPeers.get(portId) ?? [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    for (const {nodeId, portId} of moduleEndpoints.values()) {
      const module =
        await this.queryServices.spfModuleQueryService.getSpfModule(
          nodeId,
          fileSystemId,
        );
      if (module.kind === RESULT_KIND.Fail) continue;
      const port = module.data.controlPorts.find(
        candidate => candidate.systemId === portId,
      );
      if (!port) continue;
      const supported = await this.resolvePortIntents(
        nodeId,
        port.naturalId,
        NodeType.Module,
        {allocatedIntents: [], totalLinksAtPort: 0},
        fileSystemId,
      );
      if (intentIds.some(intentId => !supported.includes(intentId))) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError(
            `Module ${nodeId} does not support every requested control intent`,
          ),
        ]);
      }
    }
  }

  private async replacePortIntents(
    portSystemId: number,
    intentIds: number[],
    fileSystemId: number,
  ): Promise<void> {
    const repository = this.uow.getControlLinkRepository();
    const existing = await repository.getAllocatedIntentIds(
      portSystemId,
      fileSystemId,
    );
    if (existing.length > 0)
      await repository.deleteIntents(
        existing.map(intent => intent.intentSystemId),
        portSystemId,
      );
    await repository.createIntents(
      await Promise.all(
        intentIds.map(async intentId => ({
          systemId: await this.idGeneration.getNextId(fileSystemId),
          controlPortSystemId: portSystemId,
          intentId,
        })),
      ),
    );
  }

  protected async propagateIntents(
    portA: number,
    portB: number,
    nodeA: number,
    nodeB: number,
    _nodeTypeA: (typeof NodeType)[keyof typeof NodeType],
    _nodeTypeB: (typeof NodeType)[keyof typeof NodeType],
    intentIds: number[],
    fileSystemId: number,
    additionalSegments: SubsystemControlLink[] = [],
  ): Promise<void> {
    const repository = this.uow.getControlLinkRepository();
    const [controlLinks, subsystemLinks] = await Promise.all([
      repository.getAllControlLinks(fileSystemId),
      repository.getAllSubsystemControlLinks(fileSystemId),
    ]);
    const segments = [...subsystemLinks, ...additionalSegments];
    const allEdges = [
      ...controlLinks.map(link => ({
        peerNodeASystemId: link.peerNodeASystemId,
        peerNodeBSystemId: link.peerNodeBSystemId,
        nodeAPortSystemId: link.nodeAPortSystemId,
        nodeBPortSystemId: link.nodeBPortSystemId,
      })),
      ...segments.map(segment => ({
        peerNodeASystemId: segment.peerNodeASystemId,
        peerNodeBSystemId: segment.peerNodeBSystemId,
        nodeAPortSystemId: segment.nodeAPortSystemId,
        nodeBPortSystemId: segment.nodeBPortSystemId,
      })),
      {
        peerNodeASystemId: nodeA,
        peerNodeBSystemId: nodeB,
        nodeAPortSystemId: portA,
        nodeBPortSystemId: portB,
      },
    ];
    const reachable = collectConnectedControlPorts(allEdges, [portA, portB]);
    const ports = new Map<number, number[]>();
    ports.set(portA, intentIds);
    ports.set(portB, intentIds);
    for (const port of reachable) ports.set(port, intentIds);
    for (const [port, values] of ports)
      await this.replacePortIntents(port, values, fileSystemId);
  }
}
