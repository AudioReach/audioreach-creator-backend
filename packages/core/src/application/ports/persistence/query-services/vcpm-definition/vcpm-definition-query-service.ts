/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParameterDefinitionBase} from '../../repositories/module/module-definition.repository.js';

export interface VcpmModuleDefinitionWithParams {
  systemId: number;
  parameters: ParameterDefinitionBase[];
}

export interface VcpmDefinitionQueryService {
  getVcpmModuleDefinitionsWithParams(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParams[]>;
}
