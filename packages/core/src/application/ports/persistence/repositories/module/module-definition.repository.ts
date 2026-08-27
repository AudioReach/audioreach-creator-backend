/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleDefinition} from '../../../../../domain/entities/definitions/spf-module/spf-module-definition.js';

export interface ParameterDefinitionBase {
  systemId: number;
  elementsStructure: string; // JSON — parsed by serializeParameterData
}

export interface ModuleParameterDefinition extends ParameterDefinitionBase {
  naturalId?: number;
  name?: string;
  description?: string;
  isReadOnly: boolean;
  toolPolicy: string; // First entry of spf_module_parameter_definition.tool_policies JSON array
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
