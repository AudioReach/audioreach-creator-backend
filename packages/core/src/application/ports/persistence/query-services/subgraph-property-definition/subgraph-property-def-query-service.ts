/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  SubgraphPropertyDefinitionSummaryReadModel,
  SubgraphPropertyDefinitionReadModel,
} from './subgraph-property-definition-read-model.js';
import type {SubgraphPropertyDefinitionWithElementsReadModel} from './subgraph-property-definition-with-elements-read-model.js';
import type {Result} from '../../../../shared/result/result.js';

export interface SubgraphPropertyDefQueryService {
  /**
   * Returns all subgraph property definitions for the given file.
   * Optional propertyNaturalId filters by natural ACDB property_id.
   * Overlay is always applied.
   */
  getAllSubgraphPropertyDefinitionsSummary(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<SubgraphPropertyDefinitionSummaryReadModel[]>>;

  /**
   * Returns a single subgraph property definition by systemId.
   * Resolution order: DB row first, then session overlay.
   * Result.fail with ERROR_CODES.ENTITY_NOT_FOUND if absent from both.
   */
  getSubgraphPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<SubgraphPropertyDefinitionReadModel>>;

  /**
   * Returns all subgraph property definitions including the `elementsStructure`
   * binary field needed for parsing calibration payloads. Overlay is applied.
   */
  getAllDetailedSubgraphPropertyDefinitionsWithElements(
    fileSystemId: number,
  ): Promise<Result<SubgraphPropertyDefinitionWithElementsReadModel[]>>;

  /**
   * Returns a single subgraph property definition including elementsStructure.
   * Result.fail with ERROR_CODES.ENTITY_NOT_FOUND if not found.
   */
  getSubgraphPropertyDefinitionWithElements(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<SubgraphPropertyDefinitionWithElementsReadModel>>;
}
