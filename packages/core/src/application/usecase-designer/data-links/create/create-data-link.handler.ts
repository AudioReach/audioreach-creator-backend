/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {CommandHandler} from '../../../orchestration/cqrs/commands/command-handler.js';
import type {UnitOfWork} from '../../../ports/persistence/unit-of-work.js';
import type {IdGenerationPort} from '../../../ports/id-generation/id-generation.port.js';
import type {CreateDataLinkCommand} from './create-data-link.command.js';
import {
  type ComponentCollectionDto,
  mapDataLink,
} from '../../usecase/dto/component-collection-dto.js';
import {DataLink} from '../../../../domain/entities/usecase-data/links/data-link.js';
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

export class CreateDataLinkHandler implements CommandHandler<
  CreateDataLinkCommand,
  ComponentCollectionDto
> {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly idGeneration: IdGenerationPort,
  ) {}

  async handle(
    command: CreateDataLinkCommand,
  ): Promise<ComponentCollectionDto> {
    const uow = this.uow;
    await uow.startTransaction();
    try {
      const {session} = uow.getWriteContext();
      const fileSystemId = session.fileSystemId;

      const srcModuleId = Number.parseInt(command.sourceModuleSystemId, 10);
      const dstModuleId = Number.parseInt(
        command.destinationModuleSystemId,
        10,
      );
      const srcPortId = Number.parseInt(command.sourcePortSystemId, 10);
      const dstPortId = Number.parseInt(command.destinationPortSystemId, 10);

      // FR-DL-06: self-loop check
      if (srcModuleId === dstModuleId) {
        throw new DomainRuleViolationException([
          {
            code: 'SELF_LOOP',
            message: `Source and destination module must differ: ${BinaryUtils.toHexString(srcModuleId)}`,
            severity: IssueSeverity.Error,
          },
        ]);
      }

      const moduleRepo = uow.getModuleRepository();
      const subsystemRepo = uow.getSubsystemRepository();

      const [srcModule, dstModule] = await this.findModules(
        moduleRepo,
        subsystemRepo,
        srcModuleId,
        dstModuleId,
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

      this.validatePortDirections(srcPort, srcPortId, dstPort, dstPortId);

      const srcSubgraphId = srcModule.subgraphSystemId;
      const dstSubgraphId = dstModule.subgraphSystemId;
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

      const linkType = this.deriveLinkType(
        command.isInterUsecase,
        srcSubgraphId,
        dstSubgraphId,
      );
      if (linkType === LINK_TYPE.InterUsecase) {
        await this.validateInterUsecase(
          uow,
          srcSubgraphId,
          dstSubgraphId,
          fileSystemId,
        );
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
        linkType === LINK_TYPE.IntraUsecase
          ? (command.isEc ?? false)
          : undefined;
      const nodeParentMap =
        await subsystemRepo.getAllNodesWithParents(fileSystemId);
      const segments = SubsystemDataLinkDerivationService.compute({
        sourceNodeId: srcModuleId,
        destNodeId: dstModuleId,
        nodeParentMap,
      });

      if (existing !== null && existing.isDeleted) {
        await dlEditRepo.reactivateDataLink(
          existing.systemId,
          existing.systemId,
          {
            sourceNodeSystemId: srcModuleId,
            destinationNodeSystemId: dstModuleId,
            sourcePortSystemId: srcPortId,
            destinationPortSystemId: dstPortId,
            linkType,
            sourceSubgraphSystemId: srcSubgraphId,
            destSubgraphSystemId: dstSubgraphId,
            isEc: isEc ?? null,
            fileSystemId,
          },
        );
        const {boundaryPortPayloads, slsSegments} =
          await buildTraversalEntities(
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
              sourceNodeSystemId: srcModuleId,
              destinationNodeSystemId: dstModuleId,
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
        return this.buildDto(
          existing.systemId,
          srcModuleId,
          dstModuleId,
          srcPortId,
          dstPortId,
          linkType,
          isEc,
        );
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
      const dataLink = new DataLink({
        systemId: dataLinkSystemId,
        sourceNodeSystemId: srcModuleId,
        destinationNodeSystemId: dstModuleId,
        sourcePortSystemId: srcPortId,
        destinationPortSystemId: dstPortId,
        linkType,
        sourceSubgraphSystemId: srcSubgraphId,
        destSubgraphSystemId: dstSubgraphId,
        fileSystemId,
        isEc,
        subsystemDataLinks: slsSegments,
      });
      await dlEditRepo.createDataLink(dataLink, boundaryPortPayloads);
      await uow.commit();

      return this.buildDto(
        dataLink.systemId,
        dataLink.sourceNodeSystemId,
        dataLink.destinationNodeSystemId,
        dataLink.sourcePortSystemId,
        dataLink.destinationPortSystemId,
        dataLink.linkType,
        dataLink.isEc,
      );
    } catch (error) {
      if (uow.isInTransaction()) await uow.rollback();
      throw error;
    }
  }

  private async findModules(
    moduleRepo: ReturnType<UnitOfWork['getModuleRepository']>,
    subsystemRepo: ReturnType<UnitOfWork['getSubsystemRepository']>,
    srcModuleId: number,
    dstModuleId: number,
    fileSystemId: number,
  ) {
    const [srcModule, dstModule] = await Promise.all([
      moduleRepo.findModulePortsForLink(srcModuleId, fileSystemId),
      moduleRepo.findModulePortsForLink(dstModuleId, fileSystemId),
    ]);
    if (srcModule === null) {
      const isSubsystem = await subsystemRepo.subsystemExists(
        srcModuleId,
        fileSystemId,
      );
      throw isSubsystem
        ? new DomainRuleViolationException([
            {
              code: 'WRONG_NODE_TYPE',
              message: `Source node ${BinaryUtils.toHexString(srcModuleId)} is a subsystem, not a module.`,
              severity: IssueSeverity.Error,
            },
          ])
        : new ResourceNotFoundException(
            `Source module ${BinaryUtils.toHexString(srcModuleId)} not found.`,
          );
    }
    if (dstModule === null) {
      const isSubsystem = await subsystemRepo.subsystemExists(
        dstModuleId,
        fileSystemId,
      );
      throw isSubsystem
        ? new DomainRuleViolationException([
            {
              code: 'WRONG_NODE_TYPE',
              message: `Destination node ${BinaryUtils.toHexString(dstModuleId)} is a subsystem, not a module.`,
              severity: IssueSeverity.Error,
            },
          ])
        : new ResourceNotFoundException(
            `Destination module ${BinaryUtils.toHexString(dstModuleId)} not found.`,
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
    srcPortId: number,
    dstPort: {portIoType: string},
    dstPortId: number,
  ): void {
    if (srcPort.portIoType !== PORT_IO_TYPE.Output) {
      throw new DomainRuleViolationException([
        {
          code: 'WRONG_PORT_DIRECTION',
          message: `Source port ${BinaryUtils.toHexString(srcPortId)} must be OUTPUT, got ${srcPort.portIoType}.`,
          severity: IssueSeverity.Error,
        },
      ]);
    }
    if (dstPort.portIoType !== PORT_IO_TYPE.Input) {
      throw new DomainRuleViolationException([
        {
          code: 'WRONG_PORT_DIRECTION',
          message: `Destination port ${BinaryUtils.toHexString(dstPortId)} must be INPUT, got ${dstPort.portIoType}.`,
          severity: IssueSeverity.Error,
        },
      ]);
    }
  }

  private async validateInterUsecase(
    uow: UnitOfWork,
    srcSubgraphId: number,
    dstSubgraphId: number,
    fileSystemId: number,
  ): Promise<void> {
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

  private deriveLinkType(
    isInterUsecase: boolean | undefined,
    srcSubgraphId: number,
    dstSubgraphId: number,
  ): LinkType {
    if (isInterUsecase === true) return LINK_TYPE.InterUsecase;
    if (srcSubgraphId !== dstSubgraphId) return LINK_TYPE.IntraUsecase;
    return LINK_TYPE.IntraSubgraph;
  }

  private buildDto(
    systemId: number,
    sourceNodeSystemId: number,
    destinationNodeSystemId: number,
    sourcePortSystemId: number,
    destinationPortSystemId: number,
    linkType: LinkType,
    isEc: boolean | undefined,
  ): ComponentCollectionDto {
    return {
      spfModules: [],
      dataLinks: [
        mapDataLink({
          systemId,
          sourceNodeSystemId,
          destinationNodeSystemId,
          sourcePortSystemId,
          destinationPortSystemId,
          linkType,
          isEc: isEc ?? null,
        }),
      ],
      controlLinks: [],
    };
  }
}
