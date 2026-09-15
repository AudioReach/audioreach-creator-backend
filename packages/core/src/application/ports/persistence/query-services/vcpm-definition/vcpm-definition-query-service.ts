/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {VcpmModuleDefinitionWithParamsReadModel} from '../../repositories/vcpm-definition/vcpm-definition.repository.js';

export interface VcpmDefinitionQueryService {
  /**
   * Returns all VCPM module definitions with their parameter definitions
   * for the given fileSystemId.
   */
  getAllVcpmModuleDefinitions(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]>;
}
