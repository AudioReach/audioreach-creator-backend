/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DataSource} from 'typeorm';
import type {
  SubsystemQueryService,
  SubsystemReadModel,
  ControlLinkReadModel,
  DataLinkReadModel,
} from '@arc/core';
import {Result, IssueFactory} from '@arc/core';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import type {ControlLinkBase} from '../../entity-schema/usecase-data/Links/control-link.js';
import type {DataLinkBase} from '../../entity-schema/usecase-data/Links/data-link.js';
import type {UsecaseOverlayFetcher} from '../../fetchers/usecase-overlay-fetcher.js';
import type {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';

/**
 * Database implementation of SubsystemQueryService.
 *
 * Composes effective usecase membership, canonical links, and subsystem-link
 * segments provided by their respective fetchers.
 */
export class DbSubsystemQueryService implements SubsystemQueryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly subsystemFetcher: SubsystemOverlayFetcher,
    private readonly usecaseFetcher: UsecaseOverlayFetcher,
    private readonly linkFetcher: LinkOverlayFetcher,
  ) {}

  async findAll(fileSystemId: number): Promise<Result<SubsystemReadModel[]>> {
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );
      const subsystems = await this.subsystemFetcher.fetchAll(
        fileSystemId,
        sessionId,
      );

      return Result.ok(
        subsystems.map(s => ({
          systemId: s.systemId,
          subsystemNaturalId: s.subsystemId,
          name: s.name,
          parentSystemId: s.parentSystemId,
          filteredKeys: [],
          filteredKeySystemIds: s.filteredKeySystemIds,
        })),
      );
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error ? error.message : 'Failed to load subsystems',
        ),
      );
    }
  }

  /**
   * Returns virtual control-link segments from subsystem_control_links for
   * the given usecases. One endpoint may be a subsystem node rather than a
   * module, representing a boundary crossing. Overlay applied via
   * LinkOverlayFetcher (FR-3).
   */
  async findControlLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>> {
    if (usecaseSystemIds.length === 0) return Result.ok([]);
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      const usecaseSubgraphIds =
        await this.usecaseFetcher.getSubgraphSystemIdsForUsecases(
          usecaseSystemIds,
          sessionId,
        );
      if (usecaseSubgraphIds.length === 0) return Result.ok([]);

      const [controlLinks, segments] = await Promise.all([
        this.linkFetcher.loadControlLinkRows(fileSystemId, sessionId),
        this.linkFetcher.loadSubsystemControlLinkRows(fileSystemId, sessionId),
      ]);
      const usecaseSubgraphIdSet = new Set(usecaseSubgraphIds);
      const controlLinkBySystemId = new Map(
        controlLinks.map(link => [link.systemId, link]),
      );
      const links: ControlLinkBase[] = segments.flatMap(segment => {
        const link =
          segment.controlLinkSystemId === null
            ? undefined
            : controlLinkBySystemId.get(segment.controlLinkSystemId);
        if (
          link === undefined ||
          !this.isLinkInUsecaseScope(link, usecaseSubgraphIdSet)
        ) {
          return [];
        }
        return [
          {
            ...link,
            systemId: segment.systemId,
            peerNodeASystemId: segment.peerNodeASystemId,
            peerNodeBSystemId: segment.peerNodeBSystemId,
            nodeAPortSystemId: segment.nodeAPortSystemId,
            nodeBPortSystemId: segment.nodeBPortSystemId,
          },
        ];
      });
      return Result.ok(
        links.map(cl =>
          UseCaseQueryMappers.mapToComponentControlLinkReadModel(cl),
        ),
      );
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load subsystem control link segments',
        ),
      );
    }
  }

  async findDataLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<DataLinkReadModel[]>> {
    if (usecaseSystemIds.length === 0) return Result.ok([]);
    try {
      const sessionId = await resolveActiveSessionId(
        this.dataSource,
        fileSystemId,
      );

      const usecaseSubgraphIds =
        await this.usecaseFetcher.getSubgraphSystemIdsForUsecases(
          usecaseSystemIds,
          sessionId,
        );
      if (usecaseSubgraphIds.length === 0) return Result.ok([]);

      const [dataLinks, segments] = await Promise.all([
        this.linkFetcher.loadDataLinkRows(fileSystemId, sessionId),
        this.linkFetcher.loadSubsystemDataLinkRows(fileSystemId, sessionId),
      ]);
      const usecaseSubgraphIdSet = new Set(usecaseSubgraphIds);
      const dataLinkBySystemId = new Map(
        dataLinks.map(link => [link.systemId, link]),
      );
      const links: DataLinkBase[] = segments.flatMap(segment => {
        const link =
          segment.dataLinkSystemId === null
            ? undefined
            : dataLinkBySystemId.get(segment.dataLinkSystemId);
        if (
          link === undefined ||
          !this.isLinkInUsecaseScope(link, usecaseSubgraphIdSet)
        ) {
          return [];
        }
        return [
          {
            ...link,
            systemId: segment.systemId,
            sourceNodeSystemId: segment.sourceNodeSystemId,
            destinationNodeSystemId: segment.destinationNodeSystemId,
            sourcePortSystemId: segment.sourcePortSystemId,
            destinationPortSystemId: segment.destinationPortSystemId,
          },
        ];
      });
      return Result.ok(
        links.map(dl =>
          UseCaseQueryMappers.mapToComponentDataLinkReadModel(dl),
        ),
      );
    } catch (error) {
      return Result.fail(
        IssueFactory.dbError(
          error instanceof Error
            ? error.message
            : 'Failed to load subsystem data link segments',
        ),
      );
    }
  }

  private isLinkInUsecaseScope(
    link: Pick<
      DataLinkBase | ControlLinkBase,
      'sourceSubgraphSystemId' | 'destSubgraphSystemId'
    >,
    usecaseSubgraphIds: ReadonlySet<number>,
  ): boolean {
    return (
      usecaseSubgraphIds.has(link.sourceSubgraphSystemId) ||
      usecaseSubgraphIds.has(link.destSubgraphSystemId)
    );
  }
}
