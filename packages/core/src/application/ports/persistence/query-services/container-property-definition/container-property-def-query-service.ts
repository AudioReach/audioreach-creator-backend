/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {
  PropertyDefinitionSummaryReadModel,
  PropertyDefinitionReadModel,
} from '../property-definition/property-definition-read-model.js';
import type {ContainerPropertyDefinitionWithElementsReadModel} from './container-property-definition-with-elements-read-model.js';
import type {Result} from '../../../../shared/result/result.js';

export interface ContainerPropertyDefQueryService {
  /**
   * Returns all container property definitions for the given file.
   * Optional propertyNaturalId filters by natural ACDB property_id.
   * Overlay is always applied.
   */
  getAllContainerPropertyDefinitionsSummary(
    fileSystemId: number,
    propertyNaturalId?: number,
  ): Promise<Result<PropertyDefinitionSummaryReadModel[]>>;

  /**
   * Returns a single container property definition by systemId.
   * Resolution order: DB row first, then session overlay.
   * Result.fail with ERROR_CODES.ENTITY_NOT_FOUND if absent from both.
   */
  getContainerPropertyDefinition(
    propertySystemId: number,
    fileSystemId: number,
  ): Promise<Result<PropertyDefinitionReadModel>>;

  /**
   * Returns all container property definitions including the `elementsStructure`
   * binary field needed for parsing calibration payloads. Overlay is applied.
   */
  getAllDetailedContainerPropertyDefinitionsWithElements(
    fileSystemId: number,
  ): Promise<Result<ContainerPropertyDefinitionWithElementsReadModel[]>>;
}
