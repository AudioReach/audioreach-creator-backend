/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
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
import {NodeType} from '../../../../domain/entities/usecase-data/node/node.js';
import {mapControlLink} from '../../usecase/dto/component-collection-dto.js';
import {ControlPort} from '../../../../domain/entities/usecase-data/node/entities/control-port.js';
import type {SegmentDescriptor} from '../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';

async function buildControlTraversalEntities(
  segments: SegmentDescriptor[],
  sourcePortSystemId: number,
  destinationPortSystemId: number,
  controlLinkSystemId: number,
  linkType: ControlLinkType,
  fileSystemId: number,
  idGeneration: IdGenerationPort,
  naturalIdStarts: ReadonlyMap<number, number> = new Map(),
): Promise<{
  controlPorts: ControlPort[];
  subsystemControlLinks: SubsystemControlLink[];
}> {
  const controlPorts: ControlPort[] = [];
  const subsystemControlLinks: SubsystemControlLink[] = [];
  const portByNode = new Map<number, number>();
  const nextNaturalIdByNode = new Map<number, number>();

  const allocate = async (nodeSystemId: number): Promise<number> => {
    const existing = portByNode.get(nodeSystemId);
    if (existing !== undefined) return existing;
    const systemId = await idGeneration.getNextId(fileSystemId);
    const naturalId =
      (nextNaturalIdByNode.get(nodeSystemId) ??
        naturalIdStarts.get(nodeSystemId) ??
        0) + 1;
    nextNaturalIdByNode.set(nodeSystemId, naturalId);
    portByNode.set(nodeSystemId, systemId);
    controlPorts.push(
      new ControlPort({
        systemId,
        naturalId,
        name: '',
        isStatic: false,
        nodeSystemId,
        intentSystemIds: [],
      }),
    );
    return systemId;
  };

  for (const segment of segments) {
    if (segment.sourceBoundaryPortType !== null)
      await allocate(segment.sourceNodeSystemId);
    if (segment.destBoundaryPortType !== null)
      await allocate(segment.destinationNodeSystemId);
  }

  for (const segment of segments) {
    const sourcePort =
      segment.sourceBoundaryPortType === null
        ? sourcePortSystemId
        : portByNode.get(segment.sourceNodeSystemId)!;
    const destinationPort =
      segment.destBoundaryPortType === null
        ? destinationPortSystemId
        : portByNode.get(segment.destinationNodeSystemId)!;
    subsystemControlLinks.push(
      new SubsystemControlLink(
        await idGeneration.getNextId(fileSystemId),
        segment.sourceNodeSystemId,
        segment.destinationNodeSystemId,
        sourcePort,
        destinationPort,
        controlLinkSystemId,
        fileSystemId,
        linkType,
        0,
      ),
    );
  }
  return {controlPorts, subsystemControlLinks};
}

type ControlPortEdge = {
  readonly nodeAPortSystemId: number;
  readonly nodeBPortSystemId: number;
};

function collectConnectedControlPorts(
  edges: readonly ControlPortEdge[],
  seedPortSystemIds: readonly number[],
): ReadonlySet<number> {
  const reachable = new Set(seedPortSystemIds);
  const queue = [...seedPortSystemIds];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of edges) {
      let peer: number | undefined;
      if (edge.nodeAPortSystemId === current) peer = edge.nodeBPortSystemId;
      else if (edge.nodeBPortSystemId === current)
        peer = edge.nodeAPortSystemId;
      if (peer !== undefined && !reachable.has(peer)) {
        reachable.add(peer);
        queue.push(peer);
      }
    }
  }
  return reachable;
}

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

export abstract class ControlLinkCreationHandler<
  TResult = ComponentCollectionDto,
> {
  constructor(
    protected readonly uow: UnitOfWork,
    protected readonly idGeneration: IdGenerationPort,
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
  ): Promise<TResult>;

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
    const existing = await repository.findByPortPair(
      context.canonicalPortA,
      context.canonicalPortB,
      context.fileSystemId,
    );
    const deleted = existing?.isDeleted ? existing : null;
    const systemId =
      deleted?.systemId ??
      (await this.idGeneration.getNextId(context.fileSystemId));
    const effectiveLinkType =
      (deleted?.payload?.linkType as typeof command.linkType) ??
      command.linkType;
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
      await repository.cancelDeleteControlLink(link.systemId);
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
      const subsystem = await this.uow
        .getSubsystemRepository()
        .getSubsystem(nodeId, fileSystemId);
      if (!subsystem)
        throw new Error(
          `Unable to load control ports for boundary node ${nodeId}`,
        );
      let max = 0;
      for (const port of subsystem.controlPorts) {
        if (port.naturalId > max) max = port.naturalId;
      }
      starts.set(nodeId, max);
    }
    return starts;
  }

  protected async execute(
    command: ControlLinkCreationCommand,
  ): Promise<TResult> {
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

  private async create(command: ControlLinkCreationCommand): Promise<TResult> {
    const fileSystemId = this.uow.getWriteContext().session.fileSystemId;
    if (!Number.isInteger(command.heapId) || command.heapId < 1) {
      throw new DomainRuleViolationException([
        IssueFactory.clInvalidInput('heapId must be a positive integer'),
      ]);
    }
    if (command.peerNodeASystemId === command.peerNodeBSystemId) {
      throw new DomainRuleViolationException([
        IssueFactory.clTopologyViolation(
          'A control link cannot connect a node to itself',
        ),
      ]);
    }

    const [nodeA, nodeB] = await Promise.all([
      this.resolveNode(command.peerNodeASystemId, fileSystemId),
      this.resolveNode(command.peerNodeBSystemId, fileSystemId),
    ]);

    const [portAResult, portBResult] = await Promise.all([
      nodeA.type === NodeType.Module
        ? this.uow
            .getModuleRepository()
            .findControlPortsForLink(command.peerNodeASystemId, fileSystemId)
        : this.uow
            .getSubsystemRepository()
            .findControlPortsForLink(command.peerNodeASystemId, fileSystemId),
      nodeB.type === NodeType.Module
        ? this.uow
            .getModuleRepository()
            .findControlPortsForLink(command.peerNodeBSystemId, fileSystemId)
        : this.uow
            .getSubsystemRepository()
            .findControlPortsForLink(command.peerNodeBSystemId, fileSystemId),
    ]);
    if (!portAResult)
      throw new ResourceNotFoundException(
        `Control ports for node ${command.peerNodeASystemId} not found`,
      );
    if (!portBResult)
      throw new ResourceNotFoundException(
        `Control ports for node ${command.peerNodeBSystemId} not found`,
      );
    const portA = portAResult.find(
      port => port.systemId === command.nodeAPortSystemId,
    );
    const portB = portBResult.find(
      port => port.systemId === command.nodeBPortSystemId,
    );
    if (!portA) {
      if (
        await this.uow
          .getSubsystemRepository()
          .controlPortExists(command.nodeAPortSystemId, fileSystemId)
      )
        throw new DomainRuleViolationException([
          IssueFactory.clInvalidInput(
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
          IssueFactory.clInvalidInput(
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
    const portPairResult = await repository.findByPortPair(
      canonicalPortA,
      canonicalPortB,
      fileSystemId,
    );
    if (portPairResult?.isDeleted === false) {
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
      const [ucsA, ucsB] = await Promise.all([
        this.uow
          .getUsecaseRepository()
          .findBySubgraph(fileSystemId, nodeA.subgraphId),
        this.uow
          .getUsecaseRepository()
          .findBySubgraph(fileSystemId, nodeB.subgraphId),
      ]);
      const aIds = new Set(ucsA.map(uc => uc.systemId));
      if (ucsB.some(uc => aIds.has(uc.systemId))) {
        throw new DomainRuleViolationException([
          IssueFactory.clTopologyViolation(
            'The endpoints share a use case and cannot be inter-usecase',
          ),
        ]);
      }
      return;
    }
    if (nodeA.subgraphId === nodeB.subgraphId) return;
    const [ucsA, ucsB] = await Promise.all([
      this.uow
        .getUsecaseRepository()
        .findBySubgraph(fileSystemId, nodeA.subgraphId),
      this.uow
        .getUsecaseRepository()
        .findBySubgraph(fileSystemId, nodeB.subgraphId),
    ]);
    const aIds = new Set(ucsA.map(uc => uc.systemId));
    if (!ucsB.some(uc => aIds.has(uc.systemId))) {
      throw new DomainRuleViolationException([
        IssueFactory.clTopologyViolation(
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
        IssueFactory.clTopologyViolation(
          `No allocated intents exist on port ${command.nodeAPortSystemId}`,
        ),
      ]);
    }
    if (b.length === 0 && portB.totalLinksAtPort > 0) {
      throw new DomainRuleViolationException([
        IssueFactory.clTopologyViolation(
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
        IssueFactory.clTopologyViolation(
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
        IssueFactory.clTopologyViolation(
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
    const module = await this.uow
      .getModuleRepository()
      .findModuleForControlLink(nodeId, fileSystemId);
    if (!module) return [];
    const definition = await this.uow
      .getModuleDefinitionRepository()
      .findBySystemId(module.definitionSystemId, fileSystemId);
    if (!definition) return [];
    const staticPort = definition.staticControlPorts.find(
      candidate => candidate.naturalId === portNaturalId,
    );
    if (staticPort)
      return staticPort.staticIntents.map(intent => intent.naturalId);
    return definition.dynamicIntents.map(intent => intent.naturalId);
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

    const moduleEndpoints = await this.collectModuleEndpoints(
      [command.nodeAPortSystemId, command.nodeBPortSystemId],
      portToNode,
      segmentPeers,
      fileSystemId,
    );

    for (const {nodeId, portId} of moduleEndpoints.values()) {
      const module = await this.uow
        .getModuleRepository()
        .findModuleForControlLink(nodeId, fileSystemId);
      if (!module) continue;
      const port = module.controlPorts.find(
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
          IssueFactory.clTopologyViolation(
            `Module ${nodeId} does not support every requested control intent`,
          ),
        ]);
      }
    }
  }

  private async collectModuleEndpoints(
    startPorts: number[],
    portToNode: ReadonlyMap<number, number>,
    segmentPeers: ReadonlyMap<number, number[]>,
    fileSystemId: number,
  ): Promise<Map<string, {nodeId: number; portId: number}>> {
    const queue = [...startPorts];
    const visited = new Set(queue);
    const moduleEndpoints = new Map<string, {nodeId: number; portId: number}>();
    while (queue.length > 0) {
      const portId = queue.shift()!;
      const nodeId = portToNode.get(portId);
      if (nodeId === undefined) continue;
      const module = await this.uow
        .getModuleRepository()
        .findModuleForControlLink(nodeId, fileSystemId);
      if (module) moduleEndpoints.set(`${nodeId}:${portId}`, {nodeId, portId});
      const neighbors = segmentPeers.get(portId) ?? [];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
    return moduleEndpoints;
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
