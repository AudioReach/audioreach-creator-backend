/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Result} from '../../../../shared/result/result.js';
import type {SubsystemReadModel} from './subsystem-read-model.js';
import type {ControlLinkReadModel} from '../link/control-link-read-model.js';
import type {DataLinkReadModel} from '../link/data-link-read-model.js';

export interface SubsystemQueryService {
  /**
   * Returns all subsystems for the given file.
   * Each subsystem includes parentId (from its Node row) for in-memory tree building,
   * and filteredKeys for GET /usecases/filtered-by-subsystem.
   * Overlay applied.
   */
  findAll(fileSystemId: number): Promise<Result<SubsystemReadModel[]>>;

  /**
   * Returns virtual control-link segments (subsystem_control_links) for the given usecases.
   *
   * Unlike raw control_links, virtual segments pre-compute subsystem boundary crossings:
   *   - Non-boundary link (M3↔M4, both in SS): one segment with both module IDs.
   *   - Boundary-crossing link (M1 in SS2, M4 in SS child of SS2):
   *       Outside segment — peerNodeA=M1,          peerNodeB=SS.systemId  (placed at SS2 level)
   *       Inside  segment — peerNodeA=SS.systemId, peerNodeB=M4           (placed at SS  level)
   *
   * Scoped via subsystem_control_links → control_links → use_case_subgraph_pairs.
   * Overlay applied: session-deleted segments are removed before returning.
   * Returns the same ControlLinkReadModel DTO — no new type needed.
   */
  findControlLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<ControlLinkReadModel[]>>;

  /**
   * Returns virtual data-link segments (subsystem_data_links) for the given usecases.
   * Same scoping and overlay pattern as findControlLinkSegmentsByUsecaseIds.
   */
  findDataLinkSegmentsByUsecaseIds(
    usecaseSystemIds: number[],
    fileSystemId: number,
  ): Promise<Result<DataLinkReadModel[]>>;
}
