/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleDefinition} from '../../../../../domain/entities/definitions/spf-module/spf-module-definition.js';

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
   * Looks up the definition by natural (moduleId, procId) key.
   * Used by AddModuleHandler — caller supplies these from the command fields.
   */
  findByModuleIdAndProcId(
    moduleId: number,
    procId: number,
    fileSystemId: number,
  ): Promise<SpfModuleDefinition | null>;
}
