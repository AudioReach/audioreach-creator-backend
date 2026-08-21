/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {PatchControlLinkPropertiesCommand} from './patch-control-link-properties.command.js';
import type {ControlLinkDto} from '../../usecase/dto/component-collection-dto.js';
import type {ControlLink} from '../../../../domain/entities/usecase-data/links/control-link.js';
import {
  ResourceNotFoundException,
  DomainRuleViolationException,
} from '../../../../shared/exceptions/index.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import {mapControlLink} from '../../usecase/dto/component-collection-dto.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';

export class PatchControlLinkPropertiesHandler implements CommandHandler<
  PatchControlLinkPropertiesCommand,
  ControlLinkDto[]
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
    private readonly queryServices: QueryServices,
  ) {}

  async handle(
    command: PatchControlLinkPropertiesCommand,
  ): Promise<ControlLinkDto[]> {
    // FR-PCL-01: at least one field must be present
    if (
      command.allocatedIntents === undefined &&
      command.heapId === undefined
    ) {
      throw new DomainRuleViolationException([
        IssueFactory.validationError(
          'At least one of allocatedIntents or heapId must be provided',
        ),
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

  private async doHandle(
    command: PatchControlLinkPropertiesCommand,
  ): Promise<ControlLinkDto[]> {
    const ctx = this.uow.getWriteContext();
    const fileSystemId = ctx.session.fileSystemId;
    const repo = this.uow.getControlLinkRepository();

    // FR-PCL-02: link existence
    const controlLink = await repo.findBySystemId(
      command.controlLinkSystemId,
      fileSystemId,
    );
    if (controlLink === null) {
      throw new ResourceNotFoundException(
        `ControlLink ${command.controlLinkSystemId} not found`,
      );
    }

    const modifiedLinks = new Map<number, ControlLinkDto>();

    // FR-PCL-03: update intents via BFS chain traversal
    if (command.allocatedIntents !== undefined) {
      if (command.allocatedIntents.length === 0) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError('allocatedIntents must not be empty'),
        ]);
      }

      const newIntentIds = [
        ...new Set(command.allocatedIntents.map(intent => intent.id)),
      ];

      const {ports: visitedPorts, links: connectedLinks} =
        await this.collectConnectedRoute(controlLink, fileSystemId);

      await this.validateIntentSupport(
        newIntentIds,
        connectedLinks.values(),
        fileSystemId,
      );

      // Update intents on every port in the connected chain
      for (const portId of visitedPorts) {
        const existingIntents = await repo.getAllocatedIntentIds(
          portId,
          fileSystemId,
        );
        if (existingIntents.length > 0) {
          await repo.deleteIntents(
            existingIntents.map(e => e.intentSystemId),
            portId,
          );
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

      connectedLinks.set(controlLink.systemId, controlLink);
      for (const link of connectedLinks.values()) {
        modifiedLinks.set(link.systemId, mapControlLink(link));
      }
    }

    // FR-PCL-04: update heapId with BFS propagation through subsystem paths
    if (command.heapId !== undefined) {
      if (!Number.isInteger(command.heapId) || command.heapId < 1) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError('heapId must be a positive integer'),
        ]);
      }
      if (command.heapId !== controlLink.heapId) {
        const {links} = await this.collectConnectedRoute(
          controlLink,
          fileSystemId,
        );
        for (const link of links.values()) {
          await repo.updateHeapId(link.systemId, command.heapId);
          modifiedLinks.set(link.systemId, mapControlLink(link));
        }
      }
    }

    return [...modifiedLinks.values()];
  }

  private async collectConnectedRoute(
    controlLink: ControlLink,
    fileSystemId: number,
  ): Promise<{ports: Set<number>; links: Map<number, ControlLink>}> {
    const repo = this.uow.getControlLinkRepository();
    const route = await repo.findSubsystemControlRouteContext(fileSystemId);
    const portPeers = new Map<number, number[]>();
    const portsBySubsystem = new Map<number, number[]>();
    const add = (map: Map<number, number[]>, key: number, value: number) => {
      map.set(key, [...(map.get(key) ?? []), value]);
    };
    for (const segment of route.subsystemControlLinks) {
      add(portPeers, segment.nodeAPortSystemId, segment.nodeBPortSystemId);
      add(portPeers, segment.nodeBPortSystemId, segment.nodeAPortSystemId);
      if (
        route.nodeTypeBySystemId.get(segment.peerNodeASystemId) === 'subsystem'
      )
        add(
          portsBySubsystem,
          segment.peerNodeASystemId,
          segment.nodeAPortSystemId,
        );
      if (
        route.nodeTypeBySystemId.get(segment.peerNodeBSystemId) === 'subsystem'
      )
        add(
          portsBySubsystem,
          segment.peerNodeBSystemId,
          segment.nodeBPortSystemId,
        );
    }
    for (const ports of portsBySubsystem.values()) {
      for (const port of ports) {
        for (const sibling of ports) {
          if (port !== sibling) add(portPeers, port, sibling);
        }
      }
    }

    const ports = new Set<number>([
      controlLink.nodeAPortSystemId,
      controlLink.nodeBPortSystemId,
    ]);
    const links = new Map<number, ControlLink>([
      [controlLink.systemId, controlLink],
    ]);
    const queue = [...ports];
    while (queue.length > 0) {
      const currentPort = queue.shift()!;
      const entries = await repo.getLinksByPortSystemIds(
        [currentPort],
        fileSystemId,
      );
      for (const linkId of new Set(entries.map(entry => entry.linkSystemId))) {
        const link = await repo.findBySystemId(linkId, fileSystemId);
        if (link === null) continue;
        links.set(link.systemId, link);
        for (const port of [link.nodeAPortSystemId, link.nodeBPortSystemId]) {
          if (ports.has(port)) continue;
          ports.add(port);
          queue.push(port);
        }
      }
      for (const peer of portPeers.get(currentPort) ?? []) {
        if (ports.has(peer)) continue;
        ports.add(peer);
        queue.push(peer);
      }
    }

    for (const segment of route.subsystemControlLinks) {
      if (
        segment.controlLinkSystemId === null ||
        (!ports.has(segment.nodeAPortSystemId) &&
          !ports.has(segment.nodeBPortSystemId))
      )
        continue;
      const link = await repo.findBySystemId(
        segment.controlLinkSystemId,
        fileSystemId,
      );
      if (link !== null) links.set(link.systemId, link);
    }
    return {ports, links};
  }

  private async validateIntentSupport(
    intentIds: number[],
    links: Iterable<ControlLink>,
    fileSystemId: number,
  ): Promise<void> {
    const endpoints = new Map<number, number>();
    for (const link of links) {
      endpoints.set(link.peerNodeASystemId, link.nodeAPortSystemId);
      endpoints.set(link.peerNodeBSystemId, link.nodeBPortSystemId);
    }

    for (const [nodeId, portId] of endpoints) {
      const module =
        await this.queryServices.spfModuleQueryService.getSpfModule(
          nodeId,
          fileSystemId,
        );
      if (module.kind === RESULT_KIND.Fail) continue;
      const port = module.data.controlPorts.find(
        candidate => candidate.systemId === portId,
      );
      if (port === undefined) continue;
      const definition =
        await this.queryServices.spfModuleDefinitionQueryService.getDefinition(
          module.data.definitionSystemId,
          fileSystemId,
          CONFIGURATION_INCLUDES.FullDetails,
        );
      if (definition.kind === RESULT_KIND.Fail) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError(
            `Supported intents for module ${nodeId} could not be resolved`,
          ),
        ]);
      }
      const staticPort = (definition.data.staticControlPorts ?? []).find(
        candidate => candidate.naturalId === port.naturalId,
      );
      const supported = new Set(
        (staticPort?.staticIntents ?? definition.data.dynamicIntents ?? []).map(
          intent => intent.naturalId,
        ),
      );
      if (intentIds.some(intentId => !supported.has(intentId))) {
        throw new DomainRuleViolationException([
          IssueFactory.validationError(
            `Module ${nodeId} does not support every requested control intent`,
          ),
        ]);
      }
    }
  }
}
