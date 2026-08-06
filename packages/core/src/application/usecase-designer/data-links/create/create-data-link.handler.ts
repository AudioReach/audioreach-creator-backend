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
import type {DataLinkType} from '../../../../domain/entities/usecase-data/links/data-link-type.js';
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

      const [srcModule, dstModule] = await findModules(
        moduleRepo,
        subsystemRepo,
        srcModuleId,
        dstModuleId,
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

      const linkType = command.linkType;
      await validateLinkType(
        uow,
        linkType,
        srcSubgraphId,
        dstSubgraphId,
        fileSystemId,
      );
      const nodeParentMap =
        await subsystemRepo.getAllNodesWithParents(fileSystemId);
      const segments = SubsystemBoundaryPathService.compute({
        sourceNodeSystemId: srcModuleId,
        destinationNodeSystemId: dstModuleId,
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
            fileSystemId,
          },
        );
        const {boundaryPortPayloads, slsSegments} =
          await buildTraversalEntities(
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
        return this.buildDto(
          existing.systemId,
          srcModuleId,
          dstModuleId,
          srcPortId,
          dstPortId,
          linkType,
        );
      }

      const dataLinkSystemId = await this.idGeneration.getNextId(fileSystemId);
      const {boundaryPortPayloads, slsSegments} = await buildTraversalEntities(
        segments,
        srcPortId,
        dstPortId,
        dataLinkSystemId,
        linkType,
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
      );
    } catch (error) {
      if (uow.isInTransaction()) await uow.rollback();
      throw error;
    }
  }

  private buildDto(
    systemId: number,
    sourceNodeSystemId: number,
    destinationNodeSystemId: number,
    sourcePortSystemId: number,
    destinationPortSystemId: number,
    linkType: DataLinkType,
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
        }),
      ],
      controlLinks: [],
    };
  }
}
