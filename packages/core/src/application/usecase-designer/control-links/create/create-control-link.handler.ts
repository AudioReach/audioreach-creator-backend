/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {CreateControlLinkCommand} from './create-control-link.command.js';
import type {
  ComponentCollectionDto,
  ComponentCollectionWithSubsystemsDto,
} from '../../usecase/dto/component-collection-dto.js';
import {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import {SubsystemControlLink} from '../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import {CONTROL_LINK_TYPE} from '../../../../domain/entities/usecase-data/links/control-link-type.js';
import {ControlIntentPropagationService} from '../../../../domain/services/subsystem-control-links/control-intent-propagation.service.js';
import {ControlChainResolutionService} from '../../../../domain/services/subsystem-control-links/control-chain-resolution.service.js';
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
import type {SubsystemReadModel} from '../../../ports/persistence/query-services/subsystem/subsystem-read-model.js';

export class CreateControlLinkHandler implements CommandHandler<
  CreateControlLinkCommand,
  ComponentCollectionDto | ComponentCollectionWithSubsystemsDto
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(
    command: CreateControlLinkCommand,
  ): Promise<ComponentCollectionDto | ComponentCollectionWithSubsystemsDto> {
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
    command: CreateControlLinkCommand,
  ): Promise<ComponentCollectionDto | ComponentCollectionWithSubsystemsDto> {
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
      this.getNode(
        command.peerNodeASystemId,
        fileSystemId,
        command.allowSubsystemNodes,
      ),
      this.getNode(
        command.peerNodeBSystemId,
        fileSystemId,
        command.allowSubsystemNodes,
      ),
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
    if (!portA)
      throw new ResourceNotFoundException(
        `Control port ${command.nodeAPortSystemId} not found`,
      );
    if (!portB)
      throw new ResourceNotFoundException(
        `Control port ${command.nodeBPortSystemId} not found`,
      );

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
    if (command.allowSubsystemNodes)
      await this.checkSubsystemPortUniqueness(command, fileSystemId);
    const intents = await this.resolveIntents(
      command,
      nodeA,
      nodeB,
      portA,
      portB,
      fileSystemId,
    );
    await this.validateIntentSupport(intents, command, fileSystemId);
    if (
      command.allowSubsystemNodes &&
      (nodeA.type === NodeType.Subsystem || nodeB.type === NodeType.Subsystem)
    ) {
      return this.createSubsystemRoute(
        command,
        nodeA,
        nodeB,
        intents,
        fileSystemId,
      );
    }
    const deleted = await repository.findSoftDeletedByPortPair(
      canonicalPortA,
      canonicalPortB,
      fileSystemId,
    );
    if (deleted) {
      const reactivated = new ControlLink(
        deleted.systemId,
        deleted.fileSystemId,
        deleted.peerNodeASystemId,
        deleted.peerNodeBSystemId,
        deleted.nodeAPortSystemId,
        deleted.nodeBPortSystemId,
        command.heapId,
        deleted.linkType,
        deleted.sourceSubgraphSystemId,
        deleted.destSubgraphSystemId,
      );
      await repository.reactivateControlLink(reactivated);
      if (intents.length > 0)
        await this.propagateIntents(
          canonicalPortA,
          canonicalPortB,
          canonicalNodeA,
          canonicalNodeB,
          canonicalNodeTypeA,
          canonicalNodeTypeB,
          intents,
          fileSystemId,
        );
      return this.response(
        command,
        [nodeA.parentSystemId, nodeB.parentSystemId],
        {
          systemId: deleted.systemId,
          peerNodeASystemId: canonicalNodeA,
          peerNodeBSystemId: canonicalNodeB,
          nodeAPortSystemId: canonicalPortA,
          nodeBPortSystemId: canonicalPortB,
          heapId: command.heapId,
          linkType: deleted.linkType,
        },
      );
    }

    const systemId = await this.idGeneration.getNextId(fileSystemId);
    const link = new ControlLink(
      systemId,
      fileSystemId,
      canonicalNodeA,
      canonicalNodeB,
      canonicalPortA,
      canonicalPortB,
      command.heapId,
      command.linkType,
      nodeA.subgraphId,
      nodeB.subgraphId,
    );
    await repository.createControlLink(link);

    if (intents.length > 0) {
      await this.propagateIntents(
        canonicalPortA,
        canonicalPortB,
        canonicalNodeA,
        canonicalNodeB,
        canonicalNodeTypeA,
        canonicalNodeTypeB,
        intents,
        fileSystemId,
      );
    }

    return this.response(
      command,
      [nodeA.parentSystemId, nodeB.parentSystemId],
      {
        systemId,
        peerNodeASystemId: canonicalNodeA,
        peerNodeBSystemId: canonicalNodeB,
        nodeAPortSystemId: canonicalPortA,
        nodeBPortSystemId: canonicalPortB,
        heapId: command.heapId,
        linkType: command.linkType,
      },
    );
  }

  private async createSubsystemRoute(
    command: CreateControlLinkCommand,
    nodeA: {
      type: (typeof NodeType)[keyof typeof NodeType];
      subgraphId: number;
      parentSystemId?: number;
    },
    nodeB: {
      type: (typeof NodeType)[keyof typeof NodeType];
      subgraphId: number;
      parentSystemId?: number;
    },
    intents: number[],
    fileSystemId: number,
  ): Promise<ComponentCollectionWithSubsystemsDto> {
    const repository = this.uow.getControlLinkRepository();
    const sclId = await this.idGeneration.getNextId(fileSystemId);
    const aFirst = command.nodeAPortSystemId < command.nodeBPortSystemId;
    const segment = new SubsystemControlLink(
      sclId,
      aFirst ? command.peerNodeASystemId : command.peerNodeBSystemId,
      aFirst ? command.peerNodeBSystemId : command.peerNodeASystemId,
      aFirst ? command.nodeAPortSystemId : command.nodeBPortSystemId,
      aFirst ? command.nodeBPortSystemId : command.nodeAPortSystemId,
      null,
      fileSystemId,
      command.linkType,
      1,
    );
    const route =
      await repository.findSubsystemControlRouteContext(fileSystemId);
    const unresolved = route.subsystemControlLinks.filter(
      candidate => candidate.controlLinkSystemId === null,
    );
    const nodeTypes = new Map(route.nodeTypeBySystemId);
    nodeTypes.set(command.peerNodeASystemId, nodeA.type);
    nodeTypes.set(command.peerNodeBSystemId, nodeB.type);
    const resolution = ControlChainResolutionService.resolve({
      unresolvedSubsystemlinks: [...unresolved, segment],
      nodeTypeMap: nodeTypes,
    });
    const completed = resolution.completeChains.find(chain =>
      chain.ssLinksSystemIds.includes(sclId),
    );

    if (completed === undefined) {
      await repository.createSubsystemControlLink(segment);
      if (intents.length > 0) {
        await this.propagateIntents(
          segment.nodeAPortSystemId,
          segment.nodeBPortSystemId,
          segment.peerNodeASystemId,
          segment.peerNodeBSystemId,
          nodeTypes.get(segment.peerNodeASystemId) ?? NodeType.Subsystem,
          nodeTypes.get(segment.peerNodeBSystemId) ?? NodeType.Subsystem,
          intents,
          fileSystemId,
          [segment],
        );
      }
      return this.response(
        command,
        [nodeA.parentSystemId, nodeB.parentSystemId],
        {
          systemId: segment.systemId,
          peerNodeASystemId: segment.peerNodeASystemId,
          peerNodeBSystemId: segment.peerNodeBSystemId,
          nodeAPortSystemId: segment.nodeAPortSystemId,
          nodeBPortSystemId: segment.nodeBPortSystemId,
          heapId: command.heapId,
          linkType: segment.linkType,
        },
      ) as Promise<ComponentCollectionWithSubsystemsDto>;
    }

    const [terminalA, terminalB] = await Promise.all([
      this.getNode(completed.peerAModuleSystemId, fileSystemId, false),
      this.getNode(completed.peerBModuleSystemId, fileSystemId, false),
    ]);
    await this.validateLinkScope(command, terminalA, terminalB, fileSystemId);
    if (
      await repository.findActiveByPortPair(
        completed.peerAPortSystemId,
        completed.peerBPortSystemId,
        fileSystemId,
      )
    ) {
      throw new DuplicateLinkException(
        `A control link already exists between ports ${completed.peerAPortSystemId} and ${completed.peerBPortSystemId}`,
      );
    }

    const deleted = await repository.findSoftDeletedByPortPair(
      completed.peerAPortSystemId,
      completed.peerBPortSystemId,
      fileSystemId,
    );
    const controlLinkSystemId =
      deleted?.systemId ?? (await this.idGeneration.getNextId(fileSystemId));
    segment.controlLinkSystemId = controlLinkSystemId;
    const link = new ControlLink(
      controlLinkSystemId,
      fileSystemId,
      completed.peerAModuleSystemId,
      completed.peerBModuleSystemId,
      completed.peerAPortSystemId,
      completed.peerBPortSystemId,
      command.heapId,
      command.linkType,
      terminalA.subgraphId,
      terminalB.subgraphId,
    );
    if (deleted === null) await repository.createControlLink(link);
    else await repository.reactivateControlLink(link);
    await repository.createSubsystemControlLink(segment);
    await repository.associateSubsystemControlLinks(
      completed.ssLinksSystemIds.filter(systemId => systemId !== sclId),
      controlLinkSystemId,
    );
    if (intents.length > 0) {
      await this.propagateIntents(
        completed.peerAPortSystemId,
        completed.peerBPortSystemId,
        completed.peerAModuleSystemId,
        completed.peerBModuleSystemId,
        NodeType.Module,
        NodeType.Module,
        intents,
        fileSystemId,
        [segment],
      );
    }
    return this.response(
      command,
      [terminalA.parentSystemId, terminalB.parentSystemId],
      link,
    ) as Promise<ComponentCollectionWithSubsystemsDto>;
  }

  private async getNode(
    systemId: number,
    fileSystemId: number,
    allowSubsystemNodes: boolean,
  ): Promise<{
    type: (typeof NodeType)[keyof typeof NodeType];
    subgraphId: number;
    parentSystemId?: number;
  }> {
    const result = await this.queryServices.spfModuleQueryService.getSpfModule(
      systemId,
      fileSystemId,
    );
    if (result.kind !== RESULT_KIND.Fail)
      return {
        type: NodeType.Module,
        subgraphId: result.data.subgraphSystemId,
        parentSystemId: result.data.parentSystemId,
      };
    if (
      !allowSubsystemNodes &&
      (await this.uow
        .getSubsystemRepository()
        .subsystemExists(systemId, fileSystemId))
    ) {
      throw new DomainRuleViolationException([
        IssueFactory.validationError(
          `Node ${systemId} is a subsystem; flat control-link view accepts module nodes only`,
        ),
      ]);
    }
    if (allowSubsystemNodes) {
      const subsystems =
        await this.queryServices.subsystemQueryService.findAll(fileSystemId);
      if (
        subsystems.kind !== RESULT_KIND.Fail &&
        subsystems.data.some(subsystem => subsystem.systemId === systemId)
      )
        return {
          type: NodeType.Subsystem,
          subgraphId: 0,
          parentSystemId: subsystems.data.find(
            subsystem => subsystem.systemId === systemId,
          )?.parentSystemId,
        };
    }
    throw new ResourceNotFoundException(`Node ${systemId} not found`);
  }

  private async validateLinkScope(
    command: CreateControlLinkCommand,
    nodeA: {type: (typeof NodeType)[keyof typeof NodeType]; subgraphId: number},
    nodeB: {type: (typeof NodeType)[keyof typeof NodeType]; subgraphId: number},
    fileSystemId: number,
  ): Promise<void> {
    if (nodeA.type !== NodeType.Module || nodeB.type !== NodeType.Module)
      return;
    if (command.isInterUsecase) {
      if (command.linkType !== CONTROL_LINK_TYPE.InterUsecase) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError(
            'Inter-usecase links must use INTER_USECASE linkType',
          ),
        ]);
      }
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
    if (command.linkType === CONTROL_LINK_TYPE.InterUsecase) {
      throw new DomainRuleViolationException([
        IssueFactory.validationError(
          'INTER_USECASE links must set isInterUsecase=true',
        ),
      ]);
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
          'The endpoints belong to different use cases; set isInterUsecase=true',
        ),
      ]);
    }
  }

  private async checkSubsystemPortUniqueness(
    command: CreateControlLinkCommand,
    fileSystemId: number,
  ): Promise<void> {
    const subsystems =
      await this.queryServices.subsystemQueryService.findAll(fileSystemId);
    if (subsystems.kind === RESULT_KIND.Fail) return;
    const parentById = new Map(
      subsystems.data.map(subsystem => [
        subsystem.systemId,
        subsystem.parentSystemId,
      ]),
    );
    const isInside = (owner: number, other: number): boolean => {
      let current = other;
      const visited = new Set<number>();
      while (!visited.has(current)) {
        if (current === owner) return true;
        visited.add(current);
        const parent = parentById.get(current);
        if (parent === undefined) return false;
        current = parent;
      }
      return false;
    };
    const check = async (
      owner: number,
      port: number,
      other: number,
    ): Promise<void> => {
      const ownerIsSubsystem = parentById.has(owner);
      if (!ownerIsSubsystem) return;
      const requestedSide = isInside(owner, other) ? 'inner' : 'outer';
      const links = await this.uow
        .getControlLinkRepository()
        .getLinksByPortSystemIds([port], fileSystemId);
      for (const entry of links) {
        const existing = await this.uow
          .getControlLinkRepository()
          .findBySystemId(entry.linkSystemId, fileSystemId);
        if (!existing) continue;
        const existingOther =
          existing.nodeAPortSystemId === port
            ? existing.peerNodeBSystemId
            : existing.peerNodeASystemId;
        if (
          (isInside(owner, existingOther) ? 'inner' : 'outer') === requestedSide
        ) {
          throw new DomainRuleViolationException([
            IssueFactory.validationError(
              `Subsystem port ${port} already has an ${requestedSide} connection`,
            ),
          ]);
        }
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

  private async resolveIntents(
    command: CreateControlLinkCommand,
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
    command: CreateControlLinkCommand,
    fileSystemId: number,
  ): Promise<void> {
    if (intentIds.length === 0) return;
    const segments = await this.uow
      .getControlLinkRepository()
      .getAllSubsystemControlLinks(fileSystemId);
    const portToNode = new Map<number, number>();
    const segmentPeers = new Map<number, number[]>();
    const portsByNode = new Map<number, number[]>();
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
      add(portsByNode, segment.peerNodeASystemId, segment.nodeAPortSystemId);
      add(portsByNode, segment.peerNodeBSystemId, segment.nodeBPortSystemId);
    }
    portToNode.set(command.nodeAPortSystemId, command.peerNodeASystemId);
    portToNode.set(command.nodeBPortSystemId, command.peerNodeBSystemId);

    const queue = [command.nodeAPortSystemId, command.nodeBPortSystemId];
    const visited = new Set(queue);
    const moduleEndpoints = new Map<number, number>();
    while (queue.length > 0) {
      const portId = queue.shift()!;
      const nodeId = portToNode.get(portId);
      if (nodeId === undefined) continue;
      const module =
        await this.queryServices.spfModuleQueryService.getSpfModule(
          nodeId,
          fileSystemId,
        );
      if (module.kind !== RESULT_KIND.Fail) moduleEndpoints.set(nodeId, portId);
      const neighbors = [
        ...(segmentPeers.get(portId) ?? []),
        ...(module.kind === RESULT_KIND.Fail
          ? (portsByNode.get(nodeId) ?? [])
          : []),
      ];
      for (const neighbor of neighbors) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    for (const [nodeId, portId] of moduleEndpoints) {
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

  private async propagateIntents(
    portA: number,
    portB: number,
    nodeA: number,
    nodeB: number,
    nodeTypeA: (typeof NodeType)[keyof typeof NodeType],
    nodeTypeB: (typeof NodeType)[keyof typeof NodeType],
    intentIds: number[],
    fileSystemId: number,
    additionalSegments: SubsystemControlLink[] = [],
  ): Promise<void> {
    const repository = this.uow.getControlLinkRepository();
    const segments = [
      ...(await repository.getAllSubsystemControlLinks(fileSystemId)),
      ...additionalSegments,
    ];
    const nodeTypes = new Map<number, NodeType>([
      [nodeA, nodeTypeA],
      [nodeB, nodeTypeB],
    ]);
    for (const segment of segments) {
      for (const nodeId of [
        segment.peerNodeASystemId,
        segment.peerNodeBSystemId,
      ]) {
        if (nodeTypes.has(nodeId)) continue;
        const module =
          await this.queryServices.spfModuleQueryService.getSpfModule(
            nodeId,
            fileSystemId,
          );
        nodeTypes.set(
          nodeId,
          module.kind === RESULT_KIND.Fail
            ? NodeType.Subsystem
            : NodeType.Module,
        );
      }
    }
    const portIntentMap = new Map<number, number[]>();
    for (const segment of segments) {
      for (const port of [
        segment.nodeAPortSystemId,
        segment.nodeBPortSystemId,
      ]) {
        if (!portIntentMap.has(port)) {
          const allocated = await repository.getAllocatedIntentIds(
            port,
            fileSystemId,
          );
          portIntentMap.set(
            port,
            allocated.map(intent => intent.intentId),
          );
        }
      }
    }
    const propagated = [portA, portB].flatMap(
      startPort =>
        ControlIntentPropagationService.cascadePropagate({
          startPortSystemId: startPort,
          intentIds,
          allSubsystemControlLinks: segments.map(segment => ({
            peerNodeASystemId: segment.peerNodeASystemId,
            peerNodeBSystemId: segment.peerNodeBSystemId,
            nodeAPortSystemId: segment.nodeAPortSystemId,
            nodeBPortSystemId: segment.nodeBPortSystemId,
          })),
          nodeTypeMap: nodeTypes,
          portIntentMap,
        }).portsToFill,
    );
    const ports = new Map<number, number[]>();
    ports.set(portA, intentIds);
    ports.set(portB, intentIds);
    for (const fill of propagated) ports.set(fill.portSystemId, fill.intentIds);
    for (const [port, values] of ports)
      await this.replacePortIntents(port, values, fileSystemId);
  }

  private async response(
    command: CreateControlLinkCommand,
    endpointParentIds: (number | undefined)[],
    link: Parameters<typeof mapControlLink>[0],
  ): Promise<ComponentCollectionDto | ComponentCollectionWithSubsystemsDto> {
    const response: ComponentCollectionDto = {
      spfModules: [],
      dataLinks: [],
      controlLinks: [mapControlLink(link)],
    };
    if (!command.allowSubsystemNodes) return response;

    const result = await this.queryServices.subsystemQueryService.findAll(
      this.uow.getWriteContext().session.fileSystemId,
    );
    if (result.kind === RESULT_KIND.Fail) return {...response, subsystems: []};

    const subsystemById = new Map(
      result.data.map(subsystem => [subsystem.systemId, subsystem]),
    );
    const included = new Set<number>();
    for (const endpoint of [
      command.peerNodeASystemId,
      command.peerNodeBSystemId,
      command.parentId,
      ...endpointParentIds,
    ]) {
      let current = endpoint;
      const visited = new Set<number>();
      while (
        current != null &&
        subsystemById.has(current) &&
        !visited.has(current)
      ) {
        visited.add(current);
        included.add(current);
        current = subsystemById.get(current)?.parentSystemId;
      }
    }

    const build = (
      parentSystemId?: number,
    ): ComponentCollectionWithSubsystemsDto['subsystems'] =>
      result.data
        .filter(
          subsystem =>
            included.has(subsystem.systemId) &&
            subsystem.parentSystemId === parentSystemId,
        )
        .map(subsystem => this.mapSubsystem(subsystem, build));

    return {...response, subsystems: build()};
  }

  private mapSubsystem(
    subsystem: SubsystemReadModel,
    children: (
      parentSystemId?: number,
    ) => ComponentCollectionWithSubsystemsDto['subsystems'],
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
        controlLinks: [],
        subsystems: children(subsystem.systemId),
      },
    };
  }
}
