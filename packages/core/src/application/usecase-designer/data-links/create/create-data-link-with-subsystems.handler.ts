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
import {LINK_TYPE} from '../../../../domain/entities/usecase-data/links/link-type.js';
import type {LinkType} from '../../../../domain/entities/usecase-data/links/link-type.js';
import {PORT_IO_TYPE} from '../../../../domain/entities/common/enums/port-io-type.js';
import {SubsystemDataLinkDerivationService} from '../../../../domain/services/subsystem-data-links/subsystem-data-link-derivation.service.js';
import {buildTraversalEntities} from './build-traversal-entities.js';
import {
  ConflictException,
  DomainRuleViolationException,
  ResourceNotFoundException,
} from '../../../../shared/exceptions/index.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

function deriveLinkType(
  isInterUsecase: boolean | undefined,
  srcSubgraphId: number,
  dstSubgraphId: number,
): LinkType {
  if (isInterUsecase === true) return LINK_TYPE.InterUsecase;
  if (srcSubgraphId !== dstSubgraphId) return LINK_TYPE.IntraUsecase;
  return LINK_TYPE.IntraSubgraph;
}

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
        return this.handleBranchB(
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

      return this.handleBranchA(
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

  private async handleBranchA(
    command: CreateDataLinkWithSubsystemsCommand,
    srcNodeId: number,
    dstNodeId: number,
    srcPortId: number,
    dstPortId: number,
    fileSystemId: number,
    uow: UnitOfWork,
    subsystemRepo: ReturnType<UnitOfWork['getSubsystemRepository']>,
  ): Promise<ComponentCollectionWithSubsystemsDto> {
    // Branch A (FR-DLS-10): both endpoints are modules
    const [srcModule, dstModule] = await this.findModules(
      uow.getModuleRepository(),
      subsystemRepo,
      srcNodeId,
      dstNodeId,
      fileSystemId,
    );

    const srcPort = await this.findPort(
      subsystemRepo,
      srcModule.ports,
      srcPortId,
      fileSystemId,
      'Source',
    );
    const dstPort = await this.findPort(
      subsystemRepo,
      dstModule.ports,
      dstPortId,
      fileSystemId,
      'Destination',
    );
    this.validatePortDirections(srcPort, dstPort);

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
    const linkType = deriveLinkType(
      command.isInterUsecase,
      srcSubgraphId,
      dstSubgraphId,
    );

    if (linkType === LINK_TYPE.InterUsecase) {
      const subgraphRepo = uow.getSubgraphRepository();
      const [srcUsecaseId, dstUsecaseId] = await Promise.all([
        subgraphRepo.getUsecaseSystemIdForSubgraph(srcSubgraphId, fileSystemId),
        subgraphRepo.getUsecaseSystemIdForSubgraph(dstSubgraphId, fileSystemId),
      ]);
      if (
        srcUsecaseId !== null &&
        dstUsecaseId !== null &&
        srcUsecaseId === dstUsecaseId
      ) {
        throw new DomainRuleViolationException([
          {
            code: 'SAME_USECASE_INTER_USECASE',
            message:
              'isInterUsecase=true but source and destination belong to the same usecase.',
            severity: IssueSeverity.Error,
          },
        ]);
      }
    }

    if (command.isEc !== undefined && linkType !== LINK_TYPE.IntraUsecase) {
      throw new DomainRuleViolationException([
        {
          code: 'INVALID_EC_FLAG',
          message: 'isEc is only valid for INTRA_USECASE links.',
          severity: IssueSeverity.Error,
        },
      ]);
    }

    const isEc =
      linkType === LINK_TYPE.IntraUsecase ? (command.isEc ?? false) : undefined;
    const nodeParentMap =
      await subsystemRepo.getAllNodesWithParents(fileSystemId);
    const segments = SubsystemDataLinkDerivationService.compute({
      sourceNodeId: srcNodeId,
      destNodeId: dstNodeId,
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
          isEc: isEc ?? null,
          fileSystemId,
        },
      );
      const {boundaryPortPayloads, slsSegments} = await buildTraversalEntities(
        segments,
        srcPortId,
        dstPortId,
        existing.systemId,
        fileSystemId,
        this.idGeneration,
        nodeParentMap,
      );
      if (slsSegments.length > 0) {
        await dlEditRepo.createDataLink(
          new DataLink({
            systemId: existing.systemId,
            sourceNodeSystemId: srcNodeId,
            destinationNodeSystemId: dstNodeId,
            sourcePortSystemId: srcPortId,
            destinationPortSystemId: dstPortId,
            linkType,
            sourceSubgraphSystemId: srcSubgraphId,
            destSubgraphSystemId: dstSubgraphId,
            fileSystemId,
            isEc,
            subsystemDataLinks: slsSegments,
          }),
          boundaryPortPayloads,
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
        isEc,
        subsystemDataLinks: slsSegments,
      }),
      boundaryPortPayloads,
    );
    await uow.commit();
    return emptyCollection(slsSegments.map(sls => mapSubsystemDataLink(sls)));
  }

  private async findModules(
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
    subsystemRepo: ReturnType<UnitOfWork['getSubsystemRepository']>,
    srcNodeId: number,
    dstNodeId: number,
    fileSystemId: number,
  ) {
    const [srcModule, dstModule] = await Promise.all([
      moduleRepo.findModulePortsForLink(srcNodeId, fileSystemId),
      moduleRepo.findModulePortsForLink(dstNodeId, fileSystemId),
    ]);
    if (srcModule === null) {
      const isSubsystem = await subsystemRepo.subsystemExists(
        srcNodeId,
        fileSystemId,
      );
      throw isSubsystem
        ? new DomainRuleViolationException([
            {
              code: 'WRONG_NODE_TYPE',
              message: `Source ${BinaryUtils.toHexString(srcNodeId)} is a subsystem, not a module.`,
              severity: IssueSeverity.Error,
            },
          ])
        : new ResourceNotFoundException(
            `Source module ${BinaryUtils.toHexString(srcNodeId)} not found.`,
          );
    }
    if (dstModule === null) {
      const isSubsystem = await subsystemRepo.subsystemExists(
        dstNodeId,
        fileSystemId,
      );
      throw isSubsystem
        ? new DomainRuleViolationException([
            {
              code: 'WRONG_NODE_TYPE',
              message: `Destination ${BinaryUtils.toHexString(dstNodeId)} is a subsystem, not a module.`,
              severity: IssueSeverity.Error,
            },
          ])
        : new ResourceNotFoundException(
            `Destination module ${BinaryUtils.toHexString(dstNodeId)} not found.`,
          );
    }
    return [srcModule, dstModule] as const;
  }

  private async findPort(
    subsystemRepo: ReturnType<UnitOfWork['getSubsystemRepository']>,
    ports: {systemId: number; portIoType: string}[],
    portId: number,
    fileSystemId: number,
    side: 'Source' | 'Destination',
  ) {
    const port = ports.find(p => p.systemId === portId);
    if (port) return port;
    if (!(await subsystemRepo.portExists(portId, fileSystemId))) {
      throw new ResourceNotFoundException(
        `${side} port ${BinaryUtils.toHexString(portId)} not found.`,
      );
    }
    throw new DomainRuleViolationException([
      {
        code: 'PORT_OWNERSHIP_MISMATCH',
        message: `Port ${BinaryUtils.toHexString(portId)} does not belong to ${side.toLowerCase()} module — ownership check failed.`,
        severity: IssueSeverity.Error,
      },
    ]);
  }

  private validatePortDirections(
    srcPort: {portIoType: string},
    dstPort: {portIoType: string},
  ): void {
    if (srcPort.portIoType !== PORT_IO_TYPE.Output) {
      throw new DomainRuleViolationException([
        {
          code: 'WRONG_PORT_DIRECTION',
          message: `Source port must be OUTPUT, got ${srcPort.portIoType}.`,
          severity: IssueSeverity.Error,
        },
      ]);
    }
    if (dstPort.portIoType !== PORT_IO_TYPE.Input) {
      throw new DomainRuleViolationException([
        {
          code: 'WRONG_PORT_DIRECTION',
          message: `Destination port must be INPUT, got ${dstPort.portIoType}.`,
          severity: IssueSeverity.Error,
        },
      ]);
    }
  }

  private async handleBranchB(
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
    // Branch B (FR-DLS-11): at least one endpoint is a subsystem
    if (command.isInterUsecase !== undefined || command.isEc !== undefined) {
      throw new DomainRuleViolationException([
        {
          code: 'INVALID_FLAGS_FOR_SUBSYSTEM',
          message:
            'isInterUsecase and isEc must not be provided when a subsystem endpoint is involved.',
          severity: IssueSeverity.Error,
        },
      ]);
    }

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
    });

    const dlEditRepo = uow.getDataLinkRepository();
    await dlEditRepo.createSubsystemDataLink(sls);
    await uow.commit();
    // FR-DLS-14: return the persisted SLS in the response
    return emptyCollection([mapSubsystemDataLink(sls)]);
  }
}
