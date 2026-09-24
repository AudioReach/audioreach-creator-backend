/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {CreateDataLinkWithSubsystemsCommand} from './create-data-link-with-subsystems.command.js';
import {
  type ComponentCollectionWithSubsystemsDto,
  type DataLinkDto,
  mapSubsystemDataLink,
} from '../../usecase/dto/component-collection-dto.js';
import {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
import {SubsystemDataLink} from '../../../../domain/entities/usecase-data/links/subsystem-data-link.js';
import {PORT_IO_TYPE} from '../../../../domain/entities/common/enums/port-io-type.js';
import {SubsystemBoundaryPathService} from '../../../../domain/services/subsystem-data-links/subsystem-boundary-path.service.js';
import {buildTraversalEntities} from './build-traversal-entities.js';
import {
  findModules,
  findPort,
  validateLinkType,
  validatePortDirections,
} from './data-link-endpoint-validation.js';
import {
  ConflictException,
  DomainRuleViolationException,
  ResourceNotFoundException,
} from '../../../../shared/exceptions/index.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

function emptyCollection(
  dataLinks: DataLinkDto[] = [],
): ComponentCollectionWithSubsystemsDto {
  return {
    spfModules: [],
    dataLinks,
    controlLinks: [],
    subsystems: [],
  };
}

export class CreateDataLinkWithSubsystemsHandler implements CommandHandler<
  CreateDataLinkWithSubsystemsCommand,
  ComponentCollectionWithSubsystemsDto
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(
    command: CreateDataLinkWithSubsystemsCommand,
  ): Promise<ComponentCollectionWithSubsystemsDto> {
    const uow = this.uow;
    await uow.startTransaction();
    try {
      const {session} = uow.getWriteContext();
      const fileSystemId = session.fileSystemId;

      const srcNodeId = Number.parseInt(command.sourceNodeSystemId, 10);
      const dstNodeId = Number.parseInt(command.destinationNodeSystemId, 10);
      const srcPortId = Number.parseInt(command.sourcePortSystemId, 10);
      const dstPortId = Number.parseInt(command.destinationPortSystemId, 10);

      // FR-DLS-04: self-loop check
      if (srcNodeId === dstNodeId) {
        throw new DomainRuleViolationException([
          {
            code: 'SELF_LOOP',
            message: `Source and destination node must differ: ${BinaryUtils.toHexString(srcNodeId)}`,
            severity: IssueSeverity.Error,
          },
        ]);
      }

      const subsystemRepo = uow.getSubsystemRepository();
      const srcIsSubsystem = await subsystemRepo.subsystemExists(
        srcNodeId,
        fileSystemId,
      );
      const dstIsSubsystem = await subsystemRepo.subsystemExists(
        dstNodeId,
        fileSystemId,
      );

      if (srcIsSubsystem || dstIsSubsystem) {
        return this.handleSubsystemLinks(
          command,
          srcNodeId,
          dstNodeId,
          srcPortId,
          dstPortId,
          srcIsSubsystem,
          dstIsSubsystem,
          fileSystemId,
          uow,
          subsystemRepo,
        );
      }

      return this.handleModuleLinks(
        command,
        srcNodeId,
        dstNodeId,
        srcPortId,
        dstPortId,
        fileSystemId,
        uow,
        subsystemRepo,
      );
    } catch (error) {
      if (uow.isInTransaction()) await uow.rollback();
      throw error;
    }
  }

  private async handleModuleLinks(
    command: CreateDataLinkWithSubsystemsCommand,
    srcNodeId: number,
    dstNodeId: number,
    srcPortId: number,
    dstPortId: number,
    fileSystemId: number,
    uow: UnitOfWork,
    subsystemRepo: ReturnType<UnitOfWork['getSubsystemRepository']>,
  ): Promise<ComponentCollectionWithSubsystemsDto> {
    // Module-to-module case (FR-DLS-10): both endpoints are modules
    const [srcModule, dstModule] = await findModules(
      uow.getModuleRepository(),
      subsystemRepo,
      srcNodeId,
      dstNodeId,
      fileSystemId,
    );

    const srcPort = await findPort(
      subsystemRepo,
      srcModule.ports,
      srcPortId,
      fileSystemId,
      'Source',
    );
    const dstPort = await findPort(
      subsystemRepo,
      dstModule.ports,
      dstPortId,
      fileSystemId,
      'Destination',
    );
    validatePortDirections(srcPort, srcPortId, dstPort, dstPortId);

    const dlEditRepo = uow.getDataLinkRepository();
    const existing = await dlEditRepo.findByPortPair(
      srcPortId,
      dstPortId,
      fileSystemId,
    );
    if (existing !== null && !existing.isDeleted) {
      throw new ConflictException(
        `DataLink for ports (${BinaryUtils.toHexString(srcPortId)}, ${BinaryUtils.toHexString(dstPortId)}) already exists.`,
      );
    }

    const srcSubgraphId = srcModule.subgraphSystemId;
    const dstSubgraphId = dstModule.subgraphSystemId;
    const linkType = command.linkType;

    // FR-DLS-10: "Same linkType validation" as the flat handler — validates
    // all three classifications (NORMAL/INTER_USECASE/EC), not InterUsecase only.
    await validateLinkType(
      uow,
      linkType,
      srcSubgraphId,
      dstSubgraphId,
      fileSystemId,
    );

    const nodes = await subsystemRepo.getAllNodesWithParents(fileSystemId);
    const nodeParentMap = new Map(
      nodes.map(node => [node.systemId, node.parentSystemId]),
    );
    const segments = SubsystemBoundaryPathService.compute({
      sourceNodeSystemId: srcNodeId,
      destinationNodeSystemId: dstNodeId,
      nodeParentMap,
    });

    if (existing !== null && existing.isDeleted) {
      await dlEditRepo.reactivateDataLink(
        existing.systemId,
        existing.systemId,
        {
          sourceNodeSystemId: srcNodeId,
          destinationNodeSystemId: dstNodeId,
          sourcePortSystemId: srcPortId,
          destinationPortSystemId: dstPortId,
          linkType,
          sourceSubgraphSystemId: srcSubgraphId,
          destSubgraphSystemId: dstSubgraphId,
          fileSystemId,
        },
      );
      const {boundaryPortPayloads, slsSegments} = await buildTraversalEntities(
        segments,
        srcPortId,
        dstPortId,
        existing.systemId,
        linkType,
        fileSystemId,
        this.idGeneration,
        nodeParentMap,
      );
      if (slsSegments.length > 0) {
        // reactivateDataLink() already wrote the DataLink CREATE row above;
        // only attach the freshly-derived SLS/boundary-port rows here to
        // avoid a duplicate active CREATE for the same DataLink systemId.
        await dlEditRepo.attachTraversalEntities(
          existing.systemId,
          slsSegments,
          boundaryPortPayloads,
          fileSystemId,
        );
      }
      await uow.commit();
      return emptyCollection(slsSegments.map(sls => mapSubsystemDataLink(sls)));
    }

    const dataLinkSystemId = await this.idGeneration.getNextId(fileSystemId);
    const {boundaryPortPayloads, slsSegments} = await buildTraversalEntities(
      segments,
      srcPortId,
      dstPortId,
      dataLinkSystemId,
      command.linkType,
      fileSystemId,
      this.idGeneration,
      nodeParentMap,
    );
    await dlEditRepo.createDataLink(
      new DataLink({
        systemId: dataLinkSystemId,
        sourceNodeSystemId: srcNodeId,
        destinationNodeSystemId: dstNodeId,
        sourcePortSystemId: srcPortId,
        destinationPortSystemId: dstPortId,
        linkType,
        sourceSubgraphSystemId: srcSubgraphId,
        destSubgraphSystemId: dstSubgraphId,
        fileSystemId,
        subsystemDataLinks: slsSegments,
      }),
      boundaryPortPayloads,
    );
    await uow.commit();
    return emptyCollection(slsSegments.map(sls => mapSubsystemDataLink(sls)));
  }

  private async handleSubsystemLinks(
    command: CreateDataLinkWithSubsystemsCommand,
    srcNodeId: number,
    dstNodeId: number,
    srcPortId: number,
    dstPortId: number,
    srcIsSubsystem: boolean,
    dstIsSubsystem: boolean,
    fileSystemId: number,
    uow: UnitOfWork,
    subsystemRepo: ReturnType<UnitOfWork['getSubsystemRepository']>,
  ): Promise<ComponentCollectionWithSubsystemsDto> {
    // Subsystem-endpoint case (FR-DLS-11): at least one endpoint is a subsystem
    // FR-DLS-03 + FR-DLS-08 + FR-DLS-07: validate subsystem-side ports
    if (srcIsSubsystem) {
      const srcPortType = await subsystemRepo.getPortIoType(
        srcPortId,
        fileSystemId,
      );
      if (srcPortType === null) {
        throw new ResourceNotFoundException(
          `Source port ${BinaryUtils.toHexString(srcPortId)} not found.`,
        );
      }
      if (srcPortType !== PORT_IO_TYPE.InputOutput) {
        throw new DomainRuleViolationException([
          {
            code: 'WRONG_SUBSYSTEM_PORT_TYPE',
            message: `Source subsystem port must be InputOutput, got ${srcPortType}.`,
            severity: IssueSeverity.Error,
          },
        ]);
      }
      const occupied = await subsystemRepo.isPortOccupiedAsSource(
        srcPortId,
        fileSystemId,
      );
      if (occupied) {
        throw new DomainRuleViolationException([
          {
            code: 'PORT_ALREADY_OCCUPIED',
            message: `Source port ${BinaryUtils.toHexString(srcPortId)} is already occupied as source of an SLS.`,
            severity: IssueSeverity.Error,
          },
        ]);
      }
    }
    if (dstIsSubsystem) {
      const dstPortType = await subsystemRepo.getPortIoType(
        dstPortId,
        fileSystemId,
      );
      if (dstPortType === null) {
        throw new ResourceNotFoundException(
          `Destination port ${BinaryUtils.toHexString(dstPortId)} not found.`,
        );
      }
      if (dstPortType !== PORT_IO_TYPE.OutputInput) {
        throw new DomainRuleViolationException([
          {
            code: 'WRONG_SUBSYSTEM_PORT_TYPE',
            message: `Destination subsystem port must be OutputInput, got ${dstPortType}.`,
            severity: IssueSeverity.Error,
          },
        ]);
      }
      const occupied = await subsystemRepo.isPortOccupiedAsDest(
        dstPortId,
        fileSystemId,
      );
      if (occupied) {
        throw new DomainRuleViolationException([
          {
            code: 'PORT_ALREADY_OCCUPIED',
            message: `Destination port ${BinaryUtils.toHexString(dstPortId)} is already occupied as destination of an SLS.`,
            severity: IssueSeverity.Error,
          },
        ]);
      }
    }

    const slsSystemId = await this.idGeneration.getNextId(fileSystemId);
    const sls = new SubsystemDataLink({
      systemId: slsSystemId,
      sourceNodeSystemId: srcNodeId,
      destinationNodeSystemId: dstNodeId,
      sourcePortSystemId: srcPortId,
      destinationPortSystemId: dstPortId,
      dataLinkSystemId: null,
      fileSystemId,
      linkType: command.linkType,
    });

    const dlEditRepo = uow.getDataLinkRepository();
    await dlEditRepo.createSubsystemDataLink(sls);
    await uow.commit();
    // FR-DLS-14: return the persisted SLS in the response
    return emptyCollection([mapSubsystemDataLink(sls)]);
  }
}
