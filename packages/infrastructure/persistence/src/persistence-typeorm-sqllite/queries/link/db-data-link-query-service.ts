/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {DataLinkQueryService, Result, DataLinkReadModel} from '@arc/core';
import {Result as R, IssueFactory, LINK_TYPE} from '@arc/core';
import {ENTITY_NAMES} from '../../entity-schema/entity-table-names.js';
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {applyLinkOverlayAndMap} from '../shared/link-overlay-utils.js';
import type {DataLinkRow} from '../../entity-schema/index.js';

export class DbDataLinkQueryService implements DataLinkQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly editActionsQuerySvc: EditActionsQueryService,
  ) {}

  async findByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<DataLinkReadModel[]>> {
    if (usecaseSystemIds.length === 0) return R.ok([]);

    try {
      // Resolve session once — passed to applyLinkOverlayAndMap to avoid a second fetch
      const session =
        // eslint-disable-next-line sonarjs/deprecation
        await this.editActionsQuerySvc.findActiveSession(fileSystemId);

      const [intraSubgraph, intraUsecase] = await Promise.all([
        this.dataSource
          .getRepository(ENTITY_NAMES.DataLink)
          .createQueryBuilder('dl')
          .innerJoin(
            ENTITY_NAMES.UseCaseSubgraph,
            'ucs',
            'ucs.subgraph_system_id = dl.sourceSubgraphSystemId AND ucs.usecase_system_id IN (:...ids)',
            {ids: usecaseSystemIds},
          )
          .where('dl.linkType = :type', {type: LINK_TYPE.IntraSubgraph})
          .andWhere('dl.fileSystemId = :fileSystemId', {fileSystemId})
          .getMany(),
        this.dataSource
          .getRepository(ENTITY_NAMES.DataLink)
          .createQueryBuilder('dl')
          .innerJoin(
            ENTITY_NAMES.UseCaseSubgraphPair,
            'ucsp',
            'ucsp.source_subgraph_system_id = dl.sourceSubgraphSystemId AND ucsp.dest_subgraph_system_id = dl.destSubgraphSystemId AND ucsp.usecase_system_id IN (:...ids)',
            {ids: usecaseSystemIds},
          )
          .where('dl.linkType = :type', {type: LINK_TYPE.IntraUsecase})
          .andWhere('dl.fileSystemId = :fileSystemId', {fileSystemId})
          .getMany(),
      ]);

      return R.ok(
        await applyLinkOverlayAndMap(
          [...intraSubgraph, ...intraUsecase] as DataLinkRow[],
          ENTITY_NAMES.DataLink,
          session,
          this.editActionsQuerySvc,
          dl => UseCaseQueryMappers.mapToComponentDataLinkReadModel(dl),
        ),
      );
    } catch (error) {
      return R.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load data links for usecases',
        ),
      );
    }
  }

  async findBySubgraphId(
    subgraphId: number,
    fileSystemId: number,
  ): Promise<Result<DataLinkReadModel[]>> {
    try {
      const session =
        // eslint-disable-next-line sonarjs/deprecation
        await this.editActionsQuerySvc.findActiveSession(fileSystemId);

      const links = await this.dataSource
        .getRepository(ENTITY_NAMES.DataLink)
        .createQueryBuilder('dl')
        .where('dl.linkType = :type', {type: LINK_TYPE.IntraSubgraph})
        .andWhere('dl.sourceSubgraphSystemId = :subgraphId', {subgraphId})
        .andWhere('dl.fileSystemId = :fileSystemId', {fileSystemId})
        .getMany();

      return R.ok(
        await applyLinkOverlayAndMap(
          links as DataLinkRow[],
          ENTITY_NAMES.DataLink,
          session,
          this.editActionsQuerySvc,
          dl => UseCaseQueryMappers.mapToComponentDataLinkReadModel(dl),
        ),
      );
    } catch (error) {
      return R.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load data links for subgraph',
        ),
      );
    }
  }
}
