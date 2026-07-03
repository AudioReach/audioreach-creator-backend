/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BaseModuleDefinitionSummaryReadModel} from '../shared/module-definition-summary-read-model.js';
import type {Result} from '../../../../shared/result/result.js';

export interface DriverModuleDefinitionQueryService {
  /**
   * Returns all driver module definitions for the file, filtered by any
   * combination of moduleDefinitionId/parameterId (AND semantics — all
   * provided filters must match). Empty array if nothing matches. Overlay
   * always applied.
   */
  getAllDriverModuleDefinitions(
    fileSystemId: number,
    filters: {
      moduleDefinitionNaturalId?: number;
      parameterNaturalId?: number;
    },
  ): Promise<Result<BaseModuleDefinitionSummaryReadModel[]>>;

  /**
   * Returns a single driver module definition by system ID.
   * Result.fail with ENTITY_NOT_FOUND if absent from DB and session.
   */
  getDriverModuleDefinition(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<BaseModuleDefinitionSummaryReadModel>>;
}
