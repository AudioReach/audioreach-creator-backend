/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  ControlLinkQueryService,
  Result,
  ControlLinkReadModel,
} from '@arc/core';
import {Result as R, IssueFactory, LINK_TYPE} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {applyLinkOverlayAndMap} from '../shared/link-overlay-utils.js';
import type {ControlLinkRow} from '../../entity-schema/index.js';

export class DbControlLinkQueryService implements ControlLinkQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQuerySvc: EditActionsQueryService,
  ) {}

  async findByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>> {
    if (usecaseSystemIds.length === 0) return R.ok([]);

    try {
      const session =
        // eslint-disable-next-line sonarjs/deprecation
        await this.editActionsQuerySvc.findActiveSession(fileSystemId);

      const [intraSubgraph, intraUsecase] = await Promise.all([
        this.dataSource
          .getRepository(ENTITY_NAMES.ControlLink)
          .createQueryBuilder('cl')
          .innerJoin(
            ENTITY_NAMES.UseCaseSubgraph,
            'ucs',
            'ucs.subgraph_system_id = cl.sourceSubgraphSystemId AND ucs.usecase_system_id IN (:...ids)',
            {ids: usecaseSystemIds},
          )
          .where('cl.linkType = :type', {type: LINK_TYPE.IntraSubgraph})
          .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
          .getMany(),
        this.dataSource
          .getRepository(ENTITY_NAMES.ControlLink)
          .createQueryBuilder('cl')
          .innerJoin(
            ENTITY_NAMES.UseCaseSubgraphPair,
            'ucsp',
            'ucsp.source_subgraph_system_id = cl.sourceSubgraphSystemId AND ucsp.dest_subgraph_system_id = cl.destSubgraphSystemId AND ucsp.usecase_system_id IN (:...ids)',
            {ids: usecaseSystemIds},
          )
          .where('cl.linkType = :type', {type: LINK_TYPE.IntraUsecase})
          .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
          .getMany(),
      ]);

      return R.ok(
        await applyLinkOverlayAndMap(
          [...intraSubgraph, ...intraUsecase] as ControlLinkRow[],
          ENTITY_NAMES.ControlLink,
          session,
          this.editActionsQuerySvc,
          cl => UseCaseQueryMappers.mapToComponentControlLinkReadModel(cl),
        ),
      );
    } catch (error) {
      return R.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load control links for usecases',
        ),
      );
    }
  }

  async findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>> {
    try {
      const session =
        // eslint-disable-next-line sonarjs/deprecation
        await this.editActionsQuerySvc.findActiveSession(fileSystemId);

      const links = await this.dataSource
        .getRepository(ENTITY_NAMES.ControlLink)
        .createQueryBuilder('cl')
        .where('cl.linkType = :type', {type: LINK_TYPE.IntraSubgraph})
        .andWhere('cl.sourceSubgraphSystemId = :subgraphId', {subgraphId})
        .andWhere('cl.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany();

      return R.ok(
        await applyLinkOverlayAndMap(
          links as ControlLinkRow[],
          ENTITY_NAMES.ControlLink,
          session,
          this.editActionsQuerySvc,
          cl => UseCaseQueryMappers.mapToComponentControlLinkReadModel(cl),
        ),
      );
    } catch (error) {
      return R.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load control links for subgraph',
        ),
      );
    }
  }
}
