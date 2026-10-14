/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {VcpmModuleDefinition} from '../../../../../domain/entities/definitions/vcpm-module/vcpm-module-definition.js';

export interface VcpmDefinitionQueryService {
  getAllVcpmModuleDefinitions(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinition[]>;
}
