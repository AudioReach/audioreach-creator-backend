/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleDefinition} from '../../../../../domain/entities/definitions/spf-module/spf-module-definition.js';

export interface CalibrationParameterRecord {
  systemId: number;
  elementsStructure: string;
}

export interface ModuleDefinitionRepository {
  /**
   * Looks up the definition by its system ID (FK stored on SpfModule.definitionSystemId).
   * Used by PatchSpfModuleHandler — direct FK lookup, no natural-key round-trip needed.
   */
  findBySystemId(
    definitionSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleDefinition | null>;

  /**
   * Looks up the definition by natural (moduleDefinitionId, processorSystemId) key.
   * Used by AddModuleHandler — caller supplies these from the command fields.
   */
  findByModuleIdAndProcId(
    moduleId: number,
    procId: number,
    fileSystemId: number,
  ): Promise<SpfModuleDefinition | null>;

  /**
   * Returns all calibration parameter definitions for the given module definition.
   * Used by AddModuleHandler to seed zero-CKV default payloads.
   *
   * TODO(add-module-calibration-defaults): implement adapter
   * See: docs/edit-crud/design/add-module-calibration-defaults-design.md §5
   */
  findCalibrationParametersByDefinitionId(
    definitionSystemId: number,
    fileSystemId: number,
  ): Promise<CalibrationParameterRecord[]>;
}
