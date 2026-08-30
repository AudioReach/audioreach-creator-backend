/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {VcpmModuleDefinitionWithParamsReadModel} from '../../repositories/subgraph/subgraph.repository.js';

export interface VcpmDefinitionQueryService {
  /**
   * Returns all VCPM module definitions with their parameter definitions
   * for the given fileSystemId.
   */
  getVcpmModuleDefinitionsWithParams(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]>;
}
