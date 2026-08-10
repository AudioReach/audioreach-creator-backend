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
import type {EditActionsQueryService} from '../edit-session/edit-actions-query-service.js';
import {resolveActiveSessionId} from '../shared/session-resolver.js';
import {UseCaseQueryMappers} from '../usecase/usecase-query-mappers.js';
import {SubsystemOverlayFetcher} from '../../fetchers/subsystem-overlay-fetcher.js';
import {LinkOverlayFetcher} from '../../fetchers/link-overlay-fetcher.js';

/**
 * Database implementation of SubsystemQueryService.
 *
 * All overlay delegated to fetchers (FR-3):
 *   SubsystemOverlayFetcher.fetchAll                              — subsystem rows with parentId
 *   LinkOverlayFetcher.fetchSubsystemControlLinkSegmentsByUsecaseIds — virtual control-link boundary segments
 *   LinkOverlayFetcher.fetchSubsystemDataLinkSegmentsByUsecaseIds   — virtual data-link boundary segments
 *
 * resolveSessionId queries project_sessions directly — sessions are not
 * session-mutable themselves, so no overlay semantics apply (FR-7).
 */
export class DbSubsystemQueryService implements SubsystemQueryService {
  private readonly subsystemFetcher: SubsystemOverlayFetcher;
  private readonly linkFetcher: LinkOverlayFetcher;

  constructor(
    private readonly dataSource: DataSource,
    editActionsQuerySvc: EditActionsQueryService,
  ) {
    this.subsystemFetcher = new SubsystemOverlayFetcher(
      dataSource.manager,
      editActionsQuerySvc,
    );
    this.linkFetcher = new LinkOverlayFetcher(
      dataSource.manager,
      editActionsQuerySvc,
    );
  }

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
          name: s.name,
          parentId: s.parentId,
          filteredKeys: [], // TODO: load from SubsystemFilteredKey when filtered-by-subsystem is implemented
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
      const links =
        await this.linkFetcher.fetchSubsystemControlLinkSegmentsByUsecaseIds(
          usecaseSystemIds,
          fileSystemId,
          sessionId,
        );
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

  /**
   * Returns virtual data-link segments from subsystem_data_links for the
   * given usecases. Same scoping and overlay pattern as
   * findControlLinkSegmentsByUsecaseIds.
   */
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
      const links =
        await this.linkFetcher.fetchSubsystemDataLinkSegmentsByUsecaseIds(
          usecaseSystemIds,
          fileSystemId,
          sessionId,
        );
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

  // ── Private helpers ────────────────────────────────────────────────────────
}
