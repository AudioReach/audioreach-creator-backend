/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {CreateControlLinkCommand} from './create-control-link.command.js';
import type {ComponentCollectionDto} from '../../usecase/dto/component-collection-dto.js';
import type {ControlPortReadModel} from '../../../ports/persistence/query-services/spf-module/ports/control-port-read-model.js';
import {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import {SubsystemControlLink} from '../../../../domain/entities/usecase-data/links/subsystem-control-link.js';
import {LINK_TYPE} from '../../../../domain/entities/usecase-data/links/link-type.js';
import {NodeType} from '../../../../domain/entities/usecase-data/node/node.js';
import {
  ResourceNotFoundException,
  DomainRuleViolationException,
  DuplicateLinkException,
} from '../../../../shared/exceptions/index.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {ControlIntentPropagationService} from '../../../../domain/services/subsystem-control-links/control-intent-propagation.service.js';
import {mapControlLink} from '../../usecase/dto/component-collection-dto.js';
import type {ConfigurationIncludes} from '../../../ports/persistence/query-services/configuration-includes.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';
import {RESULT_KIND} from '../../../shared/result/result.js';

export class CreateControlLinkHandler implements CommandHandler<
  CreateControlLinkCommand,
  ComponentCollectionDto
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(command: CreateControlLinkCommand): Promise<ComponentCollectionDto> {
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

  private async doHandle(command: CreateControlLinkCommand): Promise<ComponentCollectionDto> {
    const ctx = this.uow.getWriteContext();
    const fileSystemId = ctx.session.fileSystemId;

    // FR-CL-02: no self-loops
    if (command.startNodeSystemId === command.endNodeSystemId) {
      throw new DomainRuleViolationException([
        IssueFactory.validationError('startNodeSystemId and endNodeSystemId must be different'),
      ]);
    }

    // FR-CL-03/FR-CLS-06: node existence and type validation
    const [startModule, endModule] = await Promise.all([
      this.queryServices.spfModuleQueryService.findOne(command.startNodeSystemId, fileSystemId).catch(() => null),
      this.queryServices.spfModuleQueryService.findOne(command.endNodeSystemId, fileSystemId).catch(() => null),
    ]);

    let startNodeType: typeof NodeType[keyof typeof NodeType];
    let endNodeType: typeof NodeType[keyof typeof NodeType];
    let startSubgraphId: number;
    let endSubgraphId: number;

    if (command.allowSubsystemNodes) {
      // with-subsystems view: modules OR subsystems accepted
      const startIsSubsystem = startModule === null;
      const endIsSubsystem = endModule === null;

      if (startIsSubsystem) {
        const exists = await this.uow.getSubsystemRepository().subsystemExists(command.startNodeSystemId, fileSystemId);
        if (!exists) throw new ResourceNotFoundException(`Start node ${command.startNodeSystemId} not found`);
        startNodeType = NodeType.Subsystem;
        startSubgraphId = -1; // subsystems don't have a single subgraph
      } else {
        startNodeType = NodeType.Module;
        startSubgraphId = startModule!.subgraphId;
      }

      if (endIsSubsystem) {
        const exists = await this.uow.getSubsystemRepository().subsystemExists(command.endNodeSystemId, fileSystemId);
        if (!exists) throw new ResourceNotFoundException(`End node ${command.endNodeSystemId} not found`);
        endNodeType = NodeType.Subsystem;
        endSubgraphId = -1;
      } else {
        endNodeType = NodeType.Module;
        endSubgraphId = endModule!.subgraphId;
      }
    } else {
      // flat view: modules only
      if (startModule === null) throw new ResourceNotFoundException(`Start module ${command.startNodeSystemId} not found`);
      if (endModule === null) throw new ResourceNotFoundException(`End module ${command.endNodeSystemId} not found`);
      startNodeType = NodeType.Module;
      endNodeType = NodeType.Module;
      startSubgraphId = startModule.subgraphId;
      endSubgraphId = endModule.subgraphId;
    }

    // FR-CL-04: port existence and ownership
    const [startPortResult, endPortResult] = await Promise.all([
      this.queryServices.spfModuleQueryService.nodeQueryService.getControlPorts(command.startNodeSystemId, fileSystemId),
      this.queryServices.spfModuleQueryService.nodeQueryService.getControlPorts(command.endNodeSystemId, fileSystemId),
    ]);

    if (startPortResult.kind === RESULT_KIND.Fail) throw new ResourceNotFoundException(`Control ports for start node ${command.startNodeSystemId} not found`);
    if (endPortResult.kind === RESULT_KIND.Fail) throw new ResourceNotFoundException(`Control ports for end node ${command.endNodeSystemId} not found`);

    const startPort = startPortResult.data.find(p => p.systemId === command.startPortSystemId);
    if (!startPort) throw new ResourceNotFoundException(`Start port ${command.startPortSystemId} not found`);

    const endPort = endPortResult.data.find(p => p.systemId === command.endPortSystemId);
    if (!endPort) throw new ResourceNotFoundException(`End port ${command.endPortSystemId} not found`);

    // FR-CL-11: canonical port ordering
    const [portA, portB, nodeA, nodeB] = command.startPortSystemId < command.endPortSystemId
      ? [command.startPortSystemId, command.endPortSystemId, command.startNodeSystemId, command.endNodeSystemId]
      : [command.endPortSystemId, command.startPortSystemId, command.endNodeSystemId, command.startNodeSystemId];

    const controlLinkRepo = this.uow.getControlLinkRepository();

    // FR-CL-05: duplicate check — non-deleted link with same port pair
    const existing = await controlLinkRepo.findActiveByPortPair(portA, portB, fileSystemId);
    if (existing !== null) {
      throw new DuplicateLinkException(`A control link already exists between port ${portA} and port ${portB}`);
    }

    // FR-CL-06: soft-deleted link re-activation
    const softDeleted = await controlLinkRepo.findSoftDeletedByPortPair(portA, portB, fileSystemId);
    if (softDeleted !== null) {
      await controlLinkRepo.reactivateControlLink(softDeleted.systemId);
      if (softDeleted.heapId !== command.heapId) {
        await controlLinkRepo.updateHeapId(softDeleted.systemId, command.heapId);
      }
      // Return immediately with re-activated link in the collection
      const readModel = {
        systemId: softDeleted.systemId,
        peerNodeASystemId: nodeA,
        peerNodeBSystemId: nodeB,
        nodeAPortSystemId: portA,
        nodeBPortSystemId: portB,
        heapId: command.heapId,
        linkType: softDeleted.linkType,
      };
      return {spfModules: [], dataLinks: [], controlLinks: [mapControlLink(readModel)]};
    }

    // FR-CL-10: LinkType derivation
    const linkType = await this.deriveLinkType(
      command.isInterUsecase,
      startSubgraphId,
      endSubgraphId,
      fileSystemId,
      startNodeType,
      endNodeType,
    );

    // FR-CL-07/FR-CLS-04: intent resolution
    const resolvedIntentIds = await this.resolveIntents(
      command.startNodeSystemId,
      command.startPortSystemId,
      startPort,
      command.endNodeSystemId,
      command.endPortSystemId,
      endPort,
      startNodeType,
      endNodeType,
      fileSystemId,
    );

    // FR-CL-12: source/dest subgraph for ControlLink
    const sourceSubgraphId = startNodeType === NodeType.Module ? startSubgraphId : 0;
    const destSubgraphId = endNodeType === NodeType.Module ? endSubgraphId : 0;

    // Create ControlLink entity
    const controlLinkSystemId = await this.idGeneration.getNextId(fileSystemId);
    const controlLink = new ControlLink(
      controlLinkSystemId,
      fileSystemId,
      nodeA,
      nodeB,
      portA,
      portB,
      command.heapId,
      linkType,
      sourceSubgraphId,
      destSubgraphId,
    );
    await controlLinkRepo.createControlLink(controlLink);

    // FR-CL-12: SCL segments for cross-subsystem links
    await this.createSubsystemControlLinkIfNeeded(
      controlLinkSystemId,
      command.startNodeSystemId,
      command.startPortSystemId,
      command.endNodeSystemId,
      command.endPortSystemId,
      startNodeType,
      endNodeType,
      fileSystemId,
    );

    // FR-CL-08: intent propagation
    if (resolvedIntentIds.length > 0) {
      await this.propagateIntents(portA, portB, resolvedIntentIds, fileSystemId);
    }

    const readModel = {
      systemId: controlLinkSystemId,
      peerNodeASystemId: nodeA,
      peerNodeBSystemId: nodeB,
      nodeAPortSystemId: portA,
      nodeBPortSystemId: portB,
      heapId: command.heapId,
      linkType,
    };

    return {spfModules: [], dataLinks: [], controlLinks: [mapControlLink(readModel)]};
  }

  private async deriveLinkType(
    isInterUsecase: boolean,
    startSubgraphId: number,
    endSubgraphId: number,
    fileSystemId: number,
    startNodeType: typeof NodeType[keyof typeof NodeType],
    endNodeType: typeof NodeType[keyof typeof NodeType],
  ): Promise<typeof LINK_TYPE[keyof typeof LINK_TYPE]> {
    // Subsystem nodes don't have a single subgraph — always treat as cross-subgraph
    const bothModules = startNodeType === NodeType.Module && endNodeType === NodeType.Module;

    if (isInterUsecase) {
      // Validate: nodes must not share a common usecase
      if (bothModules && startSubgraphId === endSubgraphId) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError('isInterUsecase=true but both nodes are in the same subgraph (same usecase)'),
        ]);
      }
      if (bothModules) {
        const usecaseMap = await this.queryServices.useCaseQueryService.findUsecaseIdsBySubgraphIds(
          [startSubgraphId, endSubgraphId],
          fileSystemId,
        );
        const startUsecases = new Set(usecaseMap.get(startSubgraphId) ?? []);
        const endUsecases = usecaseMap.get(endSubgraphId) ?? [];
        const sharedUsecase = endUsecases.some(id => startUsecases.has(id));
        if (sharedUsecase) {
          throw new DomainRuleViolationException([
            IssueFactory.validationError('isInterUsecase=true but nodes share a common usecase'),
          ]);
        }
      }
      return LINK_TYPE.InterUsecase;
    }

    // isInterUsecase = false
    if (bothModules && startSubgraphId === endSubgraphId) {
      return LINK_TYPE.IntraSubgraph;
    }

    if (bothModules) {
      // Different subgraphs — must be in the same usecase
      const usecaseMap = await this.queryServices.useCaseQueryService.findUsecaseIdsBySubgraphIds(
        [startSubgraphId, endSubgraphId],
        fileSystemId,
      );
      const startUsecases = new Set(usecaseMap.get(startSubgraphId) ?? []);
      const endUsecases = usecaseMap.get(endSubgraphId) ?? [];
      const sharedUsecase = endUsecases.some(id => startUsecases.has(id));
      if (!sharedUsecase) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError('isInterUsecase=false but nodes are in different usecases. Set isInterUsecase=true.'),
        ]);
      }
      return LINK_TYPE.IntraUsecase;
    }

    // When one or both nodes are subsystem nodes, default to IntraUsecase
    return LINK_TYPE.IntraUsecase;
  }

  private async resolveIntents(
    startNodeId: number,
    startPortId: number,
    startPort: ControlPortReadModel,
    endNodeId: number,
    endPortId: number,
    endPort: ControlPortReadModel,
    startNodeType: typeof NodeType[keyof typeof NodeType],
    endNodeType: typeof NodeType[keyof typeof NodeType],
    fileSystemId: number,
  ): Promise<number[]> {
    const startPortIntents = startPort.allocatedIntents.map(i => i.intentId);
    const endPortIntents = endPort.allocatedIntents.map(i => i.intentId);

    const startHasLinks = startPort.totalLinksAtPort > 0;
    const endHasLinks = endPort.totalLinksAtPort > 0;

    // Module port with no existing links: use supported intents from definition
    const getDefinitionIntents = async (nodeId: number, portId: number): Promise<number[]> => {
      if (startNodeType === NodeType.Subsystem || endNodeType === NodeType.Subsystem) return [];
      try {
        const module = await this.queryServices.spfModuleQueryService.findOne(nodeId, fileSystemId);
        const def = await this.queryServices.spfModuleDefinitionQueryService.getDefinition(
          module.definitionSystemId,
          fileSystemId,
          CONFIGURATION_INCLUDES.FullDetails as ConfigurationIncludes,
        );
        if (def.kind === RESULT_KIND.Fail) return [];
        const defData = def.data;
        // Static intents on the port
        const staticPort = (defData.staticControlPorts ?? []).find(p => p.portId === portId);
        if (staticPort) return (staticPort.staticIntents ?? []).map(i => i.intentId);
        // Dynamic intents apply to any dynamic port
        return (defData.dynamicIntents ?? []).map(i => i.intentId);
      } catch {
        return [];
      }
    };

    let resolvedStart: number[] = startHasLinks ? startPortIntents : await getDefinitionIntents(startNodeId, startPortId);
    let resolvedEnd: number[] = endHasLinks ? endPortIntents : await getDefinitionIntents(endNodeId, endPortId);

    // Subsystem port with no existing links: intents will be inherited from the other side
    if (startNodeType === NodeType.Subsystem && !startHasLinks) {
      return resolvedEnd; // inherit from end side
    }
    if (endNodeType === NodeType.Subsystem && !endHasLinks) {
      return resolvedStart; // inherit from start side
    }
    if (startNodeType === NodeType.Subsystem && endNodeType === NodeType.Subsystem && !startHasLinks && !endHasLinks) {
      return []; // both unanchored — empty is ok per FR-CLS-04
    }

    if (resolvedStart.length === 0 && resolvedEnd.length === 0) return [];

    // Intersection when both have intents
    if (resolvedStart.length > 0 && resolvedEnd.length > 0) {
      const endSet = new Set(resolvedEnd);
      const intersection = resolvedStart.filter(id => endSet.has(id));
      if (intersection.length === 0) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError('Intent intersection is empty — no common intents between the two ports'),
        ]);
      }
      return intersection;
    }

    if (resolvedStart.length > 0) return resolvedStart;
    if (resolvedEnd.length > 0) return resolvedEnd;

    throw new DomainRuleViolationException([
      IssueFactory.validationError('Could not resolve intents for this control link'),
    ]);
  }

  private async createSubsystemControlLinkIfNeeded(
    controlLinkSystemId: number,
    startNodeId: number,
    startPortId: number,
    endNodeId: number,
    endPortId: number,
    startNodeType: typeof NodeType[keyof typeof NodeType],
    endNodeType: typeof NodeType[keyof typeof NodeType],
    fileSystemId: number,
  ): Promise<void> {
    // Only create SCLs when at least one node is a subsystem
    if (startNodeType === NodeType.Module && endNodeType === NodeType.Module) return;

    const sclId = await this.idGeneration.getNextId(fileSystemId);
    const [portA, portB, nodeA, nodeB] = startPortId < endPortId
      ? [startPortId, endPortId, startNodeId, endNodeId]
      : [endPortId, startPortId, endNodeId, startNodeId];

    const scl = new SubsystemControlLink(
      sclId,
      nodeA,
      nodeB,
      portA,
      portB,
      controlLinkSystemId,
      fileSystemId,
      1,
    );
    await this.uow.getControlLinkRepository().createSubsystemControlLink(scl);
  }

  private async propagateIntents(
    portASystemId: number,
    portBSystemId: number,
    intentIds: number[],
    fileSystemId: number,
  ): Promise<void> {
    const repo = this.uow.getControlLinkRepository();
    const allScls = await repo.getAllSubsystemControlLinks(fileSystemId);

    const portIds = [portASystemId, portBSystemId];
    for (const portSystemId of portIds) {
      const result = ControlIntentPropagationService.cascadePropagate({
        startPortSystemId: portSystemId,
        intentIds,
        allSubsystemControlLinks: allScls.map(scl => ({
          peerNodeASystemId: scl.peerNodeASystemId,
          peerNodeBSystemId: scl.peerNodeBSystemId,
          nodeAPortSystemId: scl.nodeAPortSystemId,
          nodeBPortSystemId: scl.nodeBPortSystemId,
        })),
        nodeTypeMap: new Map(), // simplified — filled dynamically if needed
        portIntentMap: new Map(),
      });

      for (const {portSystemId: fillPort, intentIds: fillIntents} of result.portsToFill) {
        const existing = await repo.getAllocatedIntentIds(fillPort, fileSystemId);
        if (existing.length > 0) {
          await repo.deleteIntents(existing.map(e => e.intentSystemId), fillPort);
        }
        const newIntents = await Promise.all(
          fillIntents.map(async intentId => ({
            systemId: await this.idGeneration.getNextId(fileSystemId),
            controlPortSystemId: fillPort,
            intentId,
          })),
        );
        if (newIntents.length > 0) {
          await repo.createIntents(newIntents);
        }
      }
    }
  }
}
