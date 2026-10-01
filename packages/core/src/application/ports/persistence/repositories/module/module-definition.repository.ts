/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleDefinition} from '../../../../../domain/entities/definitions/spf-module/spf-module-definition.js';
import type {ParameterDefinitionBase} from '../shared/parameter-definition-base.js';

export interface ModuleParameterDefinition extends ParameterDefinitionBase {
  isReadOnly: boolean;
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
  findByDefIdAndProcId(
    moduleDefinitionSystemId: number,
    processorSystemId: number,
    fileSystemId: number,
  ): Promise<SpfModuleDefinition | null>;

  findBySystemIds(
    definitionSystemIds: readonly number[],
    fileSystemId: number,
  ): Promise<SpfModuleDefinition[]>;

  getParameterDefinitions(
    moduleDefSystemId: number,
    paramSystemIds?: number[],
  ): Promise<ModuleParameterDefinition[]>;
}
