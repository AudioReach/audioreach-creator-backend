/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {SpfModuleDefinition} from '../../../../../domain/entities/definitions/spf-module/spf-module-definition.js';
import type {ParameterDefinitionBase} from '../shared/parameter-definition-base.js';
import type {SpfModuleDefinitionQueryService} from '../../query-services/spf-module-definition/spf-module-definition-query-service.js';
import type {ToolPolicy} from '../../../../../domain/entities/definitions/common/types/tool-policy-type.js';

export interface ModuleParameterDefinition extends ParameterDefinitionBase {
  isReadOnly: boolean;
  toolPolicy: ToolPolicy;
}

export interface ModuleDefinitionRepository extends SpfModuleDefinitionQueryService {
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

  tagDefinitionExists(
    fileSystemId: number,
    tagDefinitionSystemId: number,
  ): Promise<boolean>;

  getProcessorNaturalId(
    processorSystemId: number,
    fileSystemId: number,
  ): Promise<number | null>;

  /**
   * Returns the SPF domain value (natural ID) for each container type system ID.
   * ContainerType has no fileSystemId — it is a system-wide lookup table.
   * Missing system IDs are silently omitted from the result map.
   */
  getContainerTypeValues(systemIds: number[]): Promise<Map<number, number>>;
}
