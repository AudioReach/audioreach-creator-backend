/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {CreateControlLinkCommand} from './create-control-link.command.js';
import type {ComponentsReadModel} from '../../../../application/ports/persistence/query-services/usecase/query-models/components-read-model.js';
import type {LinkType} from '../../../../domain/entities/usecase-data/links/link-type.js';
import type {Result} from '../../../shared/result/result.js';
import type {ControlLinkRepository} from '../../../ports/persistence/repositories/control-link/control-link.repository.js';
import type {NodeQueryService} from '../../../ports/persistence/query-services/node/node-query-service.js';
import type {SpfModuleReadModel} from '../../../ports/persistence/query-services/spf-module/spf-module-read-model.js';
import {
  DomainRuleViolationException,
  ResourceNotFoundException,
  IssueFactory,
  NodeType,
  LINK_TYPE,
  ControlLink,
  RESULT_KIND,
} from '@arc/core';
import {ControlLinkSclFactory} from '../../../../domain/services/subsystem-control-links/control-link-scl-factory.js';

function unwrap<T>(result: Result<T>): T {
  if (result.kind === RESULT_KIND.Fail) {
    throw new DomainRuleViolationException([...result.issues]);
  }
  return (result as {data: T}).data;
}

export class CreateControlLinkHandler implements CommandHandler<
  CreateControlLinkCommand,
  ComponentsReadModel
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly queryServices: QueryServices,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(
    command: CreateControlLinkCommand,
  ): Promise<ComponentsReadModel> {
    await this.uow.startTransaction();
    try {
      const {session} = this.uow.getWriteContext();
      const fileSystemId = session.fileSystemId;
      const nodeQs = this.queryServices.spfModuleQueryService.nodeQueryService;
      const clRepo = this.uow.getControlLinkRepository();

      const {
        nodeAPort,
        nodeBPort,
        canonicalNodeAId,
        canonicalNodeBId,
        canonicalNodeAType,
        canonicalNodeBType,
        spfModA,
        spfModB,
      } = await this.validateAndCanonicalise(command, fileSystemId, nodeQs);

      // FR-CLS-04 Step 1: topological side-conflict check for subsystem ports.
      // Only applies when allowModulesOnly=false (with-subsystems endpoint).
      if (!command.allowModulesOnly) {
        const nodeParentMap = unwrap(
          await nodeQs.getAllNodeParentMap(fileSystemId),
        );
        await this.checkSubsystemPortSideConflict(
          clRepo,
          nodeAPort,
          canonicalNodeAId,
          canonicalNodeBId,
          canonicalNodeAType,
          nodeParentMap,
          fileSystemId,
        );
        await this.checkSubsystemPortSideConflict(
          clRepo,
          nodeBPort,
          canonicalNodeBId,
          canonicalNodeAId,
          canonicalNodeBType,
          nodeParentMap,
          fileSystemId,
        );
      }

      await this.checkDuplicate(clRepo, nodeAPort, nodeBPort, fileSystemId);

      const softDeleted = await clRepo.findSoftDeletedByPortPair(
        nodeAPort,
        nodeBPort,
        fileSystemId,
      );
      let createdLinkSystemId: number;
      let linkType: LinkType;

      if (softDeleted) {
        await clRepo.patchControlLink(softDeleted.systemId, {});
        createdLinkSystemId = softDeleted.systemId;
        linkType = softDeleted.linkType;
      } else {
        ({createdLinkSystemId, linkType} = await this.createFresh(
          command,
          fileSystemId,
          nodeAPort,
          nodeBPort,
          canonicalNodeAId,
          canonicalNodeBId,
          spfModA,
          spfModB,
          clRepo,
          nodeQs,
        ));
      }

      await this.uow.commit();

      return {
        modules: [],
        dataLinks: [],
        controlLinks: [
          {
            systemId: createdLinkSystemId,
            peerNodeASystemId: canonicalNodeAId,
            peerNodeBSystemId: canonicalNodeBId,
            nodeAPortSystemId: nodeAPort,
            nodeBPortSystemId: nodeBPort,
            heapId: command.heapId,
            linkType,
          },
        ],
      };
    } catch (error) {
      if (this.uow.isInTransaction()) await this.uow.rollback();
      throw error;
    }
  }

  private async validateAndCanonicalise(
    command: CreateControlLinkCommand,
    fileSystemId: number,
    nodeQs: NodeQueryService,
  ) {
    if (command.peerNodeASystemId === command.peerNodeBSystemId) {
      throw new DomainRuleViolationException([
        IssueFactory.selfLoop(command.peerNodeASystemId),
      ]);
    }

    const nodeA = unwrap(
      await nodeQs.findNodeById(command.peerNodeASystemId, fileSystemId),
    );
    if (!nodeA) {
      throw new ResourceNotFoundException(
        `Node ${command.peerNodeASystemId} not found`,
      );
    }

    const nodeB = unwrap(
      await nodeQs.findNodeById(command.peerNodeBSystemId, fileSystemId),
    );
    if (!nodeB) {
      throw new ResourceNotFoundException(
        `Node ${command.peerNodeBSystemId} not found`,
      );
    }

    if (
      command.allowModulesOnly &&
      (nodeA.type === NodeType.Subsystem || nodeB.type === NodeType.Subsystem)
    ) {
      throw new DomainRuleViolationException([
        IssueFactory.subsystemNotAllowedOnFlatView(
          nodeA.type === NodeType.Subsystem
            ? command.peerNodeASystemId
            : command.peerNodeBSystemId,
        ),
      ]);
    }

    const isSwapped = command.nodeAPortSystemId > command.nodeBPortSystemId;
    const nodeAPort = isSwapped
      ? command.nodeBPortSystemId
      : command.nodeAPortSystemId;
    const nodeBPort = isSwapped
      ? command.nodeAPortSystemId
      : command.nodeBPortSystemId;
    const canonicalNodeAId = isSwapped
      ? command.peerNodeBSystemId
      : command.peerNodeASystemId;
    const canonicalNodeBId = isSwapped
      ? command.peerNodeASystemId
      : command.peerNodeBSystemId;
    const canonicalNodeAType = isSwapped ? nodeB.type : nodeA.type;
    const canonicalNodeBType = isSwapped ? nodeA.type : nodeB.type;

    const spfModA =
      canonicalNodeAType === NodeType.Module
        ? await this.queryServices.spfModuleQueryService.findOne(
            canonicalNodeAId,
            fileSystemId,
          )
        : null;
    const spfModB =
      canonicalNodeBType === NodeType.Module
        ? await this.queryServices.spfModuleQueryService.findOne(
            canonicalNodeBId,
            fileSystemId,
          )
        : null;

    this.validatePortOwnership(spfModA, nodeAPort, canonicalNodeAId);
    this.validatePortOwnership(spfModB, nodeBPort, canonicalNodeBId);

    return {
      nodeAPort,
      nodeBPort,
      canonicalNodeAId,
      canonicalNodeBId,
      canonicalNodeAType,
      canonicalNodeBType,
      spfModA,
      spfModB,
    };
  }

  private validatePortOwnership(
    spfMod: SpfModuleReadModel | null,
    portSystemId: number,
    nodeId: number,
  ): void {
    if (!spfMod) return;
    const port = spfMod.controlPorts.find(p => p.systemId === portSystemId);
    if (!port) {
      throw new ResourceNotFoundException(
        `Control port ${portSystemId} not found on module ${nodeId}`,
      );
    }
  }

  private async checkDuplicate(
    clRepo: ControlLinkRepository,
    nodeAPort: number,
    nodeBPort: number,
    fileSystemId: number,
  ): Promise<void> {
    const existing = await clRepo.findNonDeletedByPortPair(
      nodeAPort,
      nodeBPort,
      fileSystemId,
    );
    if (existing) {
      throw new DomainRuleViolationException([
        IssueFactory.duplicateControlLink(nodeAPort, nodeBPort),
      ]);
    }
  }

  /**
   * FR-CLS-04 Step 1 — topological side-conflict check.
   *
   * A subsystem control port may carry one inner-side connection and one
   * outer-side connection. "Inner" means the other endpoint is a child of
   * the subsystem that owns this port; "outer" means it is not.
   *
   * If any existing non-deleted link through `portSystemId` already occupies
   * the same side as `newOtherNodeId`, throw 422.
   */
  private async checkSubsystemPortSideConflict(
    clRepo: ControlLinkRepository,
    portSystemId: number,
    portOwnerNodeId: number,
    newOtherNodeId: number,
    portOwnerNodeType: NodeType,
    nodeParentMap: Map<number, number | null>,
    fileSystemId: number,
  ): Promise<void> {
    if (portOwnerNodeType !== NodeType.Subsystem) return;

    const existingLinks = await clRepo.findNonDeletedByPort(
      portSystemId,
      fileSystemId,
    );
    if (existingLinks.length === 0) return;

    const newOtherIsInner =
      nodeParentMap.get(newOtherNodeId) === portOwnerNodeId;

    for (const link of existingLinks) {
      const otherNodeId =
        link.nodeAPortSystemId === portSystemId
          ? link.peerNodeBSystemId
          : link.peerNodeASystemId;
      const existingIsInner =
        nodeParentMap.get(otherNodeId) === portOwnerNodeId;
      if (existingIsInner === newOtherIsInner) {
        throw new DomainRuleViolationException([
          IssueFactory.subsystemPortSideConflict(portSystemId),
        ]);
      }
    }
  }

  private async createFresh(
    command: CreateControlLinkCommand,
    fileSystemId: number,
    nodeAPort: number,
    nodeBPort: number,
    canonicalNodeAId: number,
    canonicalNodeBId: number,
    spfModA: SpfModuleReadModel | null,
    spfModB: SpfModuleReadModel | null,
    clRepo: ControlLinkRepository,
    nodeQs: NodeQueryService,
  ): Promise<{createdLinkSystemId: number; linkType: LinkType}> {
    const resolvedIntentIds = await this.resolveIntents(
      clRepo,
      nodeQs,
      nodeAPort,
      nodeBPort,
      spfModA,
      spfModB,
      fileSystemId,
    );

    const hasModuleEndpoint = spfModA !== null || spfModB !== null;
    if (resolvedIntentIds.length === 0 && hasModuleEndpoint) {
      throw new DomainRuleViolationException([
        IssueFactory.emptyIntentIntersection(nodeAPort, nodeBPort),
      ]);
    }

    const subgraphA = spfModA?.subgraphId ?? 0;
    const subgraphB = spfModB?.subgraphId ?? 0;
    let linkType: LinkType;
    if (command.isInterUsecase) {
      linkType = LINK_TYPE.InterUsecase;
    } else if (subgraphA === subgraphB) {
      linkType = LINK_TYPE.IntraSubgraph;
    } else {
      linkType = LINK_TYPE.IntraUsecase;
    }

    const newSystemId = await this.idGeneration.getNextId(fileSystemId);
    const controlLink = new ControlLink(
      newSystemId,
      fileSystemId,
      canonicalNodeAId,
      canonicalNodeBId,
      nodeAPort,
      nodeBPort,
      command.heapId,
      linkType,
      subgraphA,
      subgraphB,
    );
    await clRepo.createControlLink(controlLink);

    await this.stageIntentRows(
      clRepo,
      resolvedIntentIds,
      nodeAPort,
      nodeBPort,
      fileSystemId,
    );

    await this.stageSclSegments(
      clRepo,
      nodeQs,
      newSystemId,
      canonicalNodeAId,
      canonicalNodeBId,
      nodeAPort,
      nodeBPort,
      resolvedIntentIds,
      fileSystemId,
    );

    return {createdLinkSystemId: newSystemId, linkType};
  }

  private async resolveIntents(
    clRepo: ControlLinkRepository,
    nodeQs: NodeQueryService,
    nodeAPort: number,
    nodeBPort: number,
    spfModA: SpfModuleReadModel | null,
    spfModB: SpfModuleReadModel | null,
    fileSystemId: number,
  ): Promise<number[]> {
    const intentsA = await this.loadPortIntents(
      clRepo,
      nodeQs,
      nodeAPort,
      spfModA,
      fileSystemId,
    );
    const intentsB = await this.loadPortIntents(
      clRepo,
      nodeQs,
      nodeBPort,
      spfModB,
      fileSystemId,
    );

    if (intentsA.length === 0 && intentsB.length === 0) return [];
    if (intentsA.length === 0) return intentsB;
    if (intentsB.length === 0) return intentsA;
    const setB = new Set(intentsB);
    return intentsA.filter(id => setB.has(id));
  }

  private async loadPortIntents(
    clRepo: ControlLinkRepository,
    nodeQs: NodeQueryService,
    portSystemId: number,
    spfMod: SpfModuleReadModel | null,
    fileSystemId: number,
  ): Promise<number[]> {
    const links = await clRepo.getLinksByPortSystemIds(
      [portSystemId],
      fileSystemId,
    );
    if (links.length > 0) {
      const intentMap = unwrap(
        await nodeQs.getIntentsByPortSystemIds([portSystemId], fileSystemId),
      );
      return (intentMap.get(portSystemId) ?? []).map(
        (i: {intentId: number}) => i.intentId,
      );
    }
    if (spfMod) {
      const port = spfMod.controlPorts.find(p => p.systemId === portSystemId);
      return port ? port.allocatedIntents.map(i => i.intentId) : [];
    }
    return [];
  }

  private async stageIntentRows(
    clRepo: ControlLinkRepository,
    resolvedIntentIds: number[],
    nodeAPort: number,
    nodeBPort: number,
    fileSystemId: number,
  ): Promise<void> {
    for (const intentId of resolvedIntentIds) {
      const sysIdA = await this.idGeneration.getNextId(fileSystemId);
      await clRepo.stageIntentCreate({
        systemId: sysIdA,
        controlPortSystemId: nodeAPort,
        intentId,
      });
      const sysIdB = await this.idGeneration.getNextId(fileSystemId);
      await clRepo.stageIntentCreate({
        systemId: sysIdB,
        controlPortSystemId: nodeBPort,
        intentId,
      });
    }
  }

  private async stageSclSegments(
    clRepo: ControlLinkRepository,
    nodeQs: NodeQueryService,
    controlLinkSystemId: number,
    nodeAId: number,
    nodeBId: number,
    nodeAPort: number,
    nodeBPort: number,
    resolvedIntentIds: number[],
    fileSystemId: number,
  ): Promise<void> {
    const nodeParentMap = unwrap(
      await nodeQs.getAllNodeParentMap(fileSystemId),
    );
    const {nodeSequence} = ControlLinkSclFactory.compute({
      nodeASystemId: nodeAId,
      nodeBSystemId: nodeBId,
      nodeParentMap,
    });
    if (nodeSequence.length <= 2) return;

    const allPortIds: number[] = [nodeAPort];
    for (let i = 0; i < nodeSequence.length - 1; i++) {
      const portOnNext = await this.resolveNextBoundaryPort(
        clRepo,
        nodeQs,
        nodeSequence,
        i,
        nodeBPort,
        resolvedIntentIds,
        fileSystemId,
      );
      allPortIds.push(portOnNext);
      const sclId = await this.idGeneration.getNextId(fileSystemId);
      await clRepo.createSubsystemControlLink({
        systemId: sclId,
        peerNodeASystemId: nodeSequence[i],
        peerNodeBSystemId: nodeSequence[i + 1],
        nodeAPortSystemId: allPortIds[i],
        nodeBPortSystemId: portOnNext,
        controlLinkSystemId,
        fileSystemId,
      });
    }
  }

  private async resolveNextBoundaryPort(
    clRepo: ControlLinkRepository,
    nodeQs: NodeQueryService,
    nodeSequence: number[],
    segmentIndex: number,
    nodeBPort: number,
    resolvedIntentIds: number[],
    fileSystemId: number,
  ): Promise<number> {
    if (segmentIndex === nodeSequence.length - 2) return nodeBPort;

    const nextNode = nodeSequence[segmentIndex + 1];
    const existingPorts = unwrap(
      await nodeQs.getControlPorts(nextNode, fileSystemId),
    );
    const nextPortId = existingPorts.length + 1;
    const newPortSystemId = await this.idGeneration.getNextId(fileSystemId);

    await clRepo.stageControlPortCreate({
      systemId: newPortSystemId,
      nodeSystemId: nextNode,
      portId: nextPortId,
      isStatic: false,
      fileSystemId,
    });

    for (const intentId of resolvedIntentIds) {
      const intentSysId = await this.idGeneration.getNextId(fileSystemId);
      await clRepo.stageIntentCreate({
        systemId: intentSysId,
        controlPortSystemId: newPortSystemId,
        intentId,
      });
    }

    return newPortSystemId;
  }
}
