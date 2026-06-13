/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {DefinitionSpec} from './definition-attribute.js';
import type {SpfModuleDefinitionReadModel} from './spf-module-definition-read-model.js';
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
   * Result.fail if the definition is not found or DB error occurs.
   *
   * Identity (name, moduleId) is always loaded.
   * Pass includes to load additional child tables — each applies the
   * three-tier edit session overlay independently.
   */
  getDefinition(
    defSystemId: number,
    fileSystemId: number,
    includes: DefinitionSpec,
    applyOverlay: true,
  ): Promise<Result<SpfModuleDefinitionReadModel>>;
}
