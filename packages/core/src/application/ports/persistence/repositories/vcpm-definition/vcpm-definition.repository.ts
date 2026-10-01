/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParamDefinition} from '../../../../../domain/entities/definitions/common/entities/param-definition.js';
import type {VcpmModuleDefinition} from '../../../../../domain/entities/definitions/vcpm-module/vcpm-module-definition.js';

type VcpmParameterDefault = Pick<
  ParamDefinition,
  'systemId' | 'elementsStructure'
>;

export interface VcpmModuleDefinitionWithParamsReadModel {
  moduleDefinitionSystemId: VcpmModuleDefinition['systemId'];
  parameters: VcpmParameterDefault[];
}

/** Read-only VCPM module-definition projection used by write handlers. */
export interface VcpmDefinitionRepository {
  getAllVcpmModuleDefinitions(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]>;
}
