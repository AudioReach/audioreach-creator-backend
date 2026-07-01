/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleDefinitionReadModel} from './spf-module-definition-read-model.js';
import type {ParameterDefinitionReadModel} from './parameter-definition/parameter-definition-read-model.js';
import type {ConfigurationIncludes} from '../configuration-includes.js';
import type {Result} from '../../../../shared/Result/operation-result.js';

export interface SpfModuleDefinitionQueryService {
  /**
   * Returns the definition system ID for a given SPF module instance.
   * Result.fail if the module is not found.
   */
  getModuleDefinitionSystemId(
    spfModuleSystemId: number,
  ): Promise<Result<number>>;

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
}
