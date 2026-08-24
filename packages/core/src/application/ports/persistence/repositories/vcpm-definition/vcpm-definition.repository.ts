/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {VcpmModuleDefinition} from '../../../../../domain/entities/definitions/vcpm-module/vcpm-module-definition.js';

/** Read-only VCPM module-definition projection used by write handlers. */
export interface VcpmDefinitionRepository {
  getAllVcpmModuleDefinitions(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinition[]>;
}
