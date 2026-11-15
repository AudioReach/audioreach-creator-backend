/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Result} from '../../../../shared/result/result.js';
import type {SubsystemReadModel} from './subsystem-read-model.js';

export interface SubsystemQueryService {
  /**
   * Returns all subsystems for the given file.
   * Each subsystem includes parentId (from its Node row) for in-memory tree building,
   * and filteredKeys for GET /usecases/filtered-by-subsystem.
   * Overlay applied. When systemIds is supplied, only those subsystem system
   * IDs are returned.
   */
  findAll(
    fileSystemId: number,
    systemIds?: number[],
  ): Promise<Result<SubsystemReadModel[]>>;
}
