/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  SpfModuleDefinitionReadModel,
  SpfModuleDefinitionSummaryReadModel,
} from './spf-module-definition-read-model.js';
import type {ParameterDefinitionReadModel} from './parameter-definition/parameter-definition-read-model.js';
import type {CustomModuleMetadataReadModel} from './custom-module-metadata-read-model.js';
import type {ConfigurationIncludes} from '../configuration-includes.js';
import type {Result} from '../../../../shared/result/result.js';

export interface SpfModuleDefinitionQueryService {
  /**
   * Returns definition data for the given definition system ID.
   * Overlay always applied.
   *
   * summary (default) → identity + port capacity counts
   * fullDetails       → summary + port groups, control ports, dynamic intents, parameters
   *
   * Result.fail if not found or DB error occurs.
   */
  getDefinition(
    defSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<SpfModuleDefinitionReadModel>>;

  /**
   * Returns one parameter definition by its systemId.
   * Overlay always applied.
   *
   * summary     → systemId, paramId, name, description, pidType
   * fullDetails → all fields
   *
   * Result.fail if not found or DB error occurs.
   */
  getParameterDefinition(
    parameterDefinitionSystemId: number,
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<Result<ParameterDefinitionReadModel>>;

  /**
   * Returns parameter definitions for the given module definition system ID.
   * Overlay always applied.
   *
   * If paramSystemIds is provided, only definitions for those IDs are returned.
   * Otherwise all definitions under the module are returned.
   *
   * sessionId — pass the caller's already-resolved active session ID
   * (or null if the caller already confirmed there is none) to avoid a
   * second independent findActiveSession lookup for the same fileSystemId.
   * Callers with no session context of their own can omit it — this
   * method resolves its own session as before.
   */
  queryParameterDefinitions(
    fileSystemId: number,
    moduleDefSystemId: number,
    paramSystemIds?: number[],
    sessionId?: number | null,
  ): Promise<ParameterDefinitionReadModel[]>;

  /**
   * Returns all SPF module definitions for the file, filtered by any
   * combination of processorId/moduleDefinitionId/parameterId (AND
   * semantics — all provided filters must match). Empty array if
   * nothing matches. Overlay always applied.
   */
  getAllSpfModuleDefinitionSummaries(
    fileSystemId: number,
    filters: {
      processorNaturalId?: number;
      moduleDefinitionNaturalId?: number;
      parameterNaturalId?: number;
    },
  ): Promise<Result<SpfModuleDefinitionSummaryReadModel[]>>;

  /**
   * Returns a single SPF module definition summary by system ID.
   * Result.fail with ENTITY_NOT_FOUND if absent from DB and session.
   */
  getSpfModuleDefinitionSummary(
    moduleSystemId: number,
    fileSystemId: number,
  ): Promise<Result<SpfModuleDefinitionSummaryReadModel>>;

  /**
   * Returns FR-3's custom module metadata for one module definition,
   * sourced from module_manager_data (joined by moduleDefinitionSystemId).
   * Result.fail with ENTITY_NOT_FOUND if no module_manager_data row exists.
   */
  getCustomModuleMetadata(
    moduleDefinitionSystemId: number,
    fileSystemId: number,
  ): Promise<Result<CustomModuleMetadataReadModel>>;

  /**
   * Batched variant of getCustomModuleMetadata for a list of module
   * definition system IDs — one query total instead of one per module,
   * mirroring loadParameterDefinitionsForModules's batching shape. Modules
   * with no module_manager_data row are simply absent from the returned
   * map — callers decide how to treat a miss (unlike the single-item
   * method, this never fails the whole call for one missing row).
   */
  getCustomModuleMetadataBySystemIds(
    moduleDefinitionSystemIds: number[],
    fileSystemId: number,
  ): Promise<Map<number, CustomModuleMetadataReadModel>>;
}
