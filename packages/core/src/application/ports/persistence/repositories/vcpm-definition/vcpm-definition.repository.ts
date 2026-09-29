/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ParameterDefinitionBase} from '../shared/parameter-definition-base.js';

export interface VcpmModuleDefinitionWithParamsReadModel {
  moduleDefinitionSystemId: number;
  parameters: ParameterDefinitionBase[];
}

export interface VcpmDefaultData {
  definitionSystemId: number;
  parameters: Array<{
    parameterSystemId: number;
    payload: Uint8Array;
  }>;
}

/**
 * VCPM definition reads and configuration writes used by write handlers.
 * Payload bytes in addVcpmDefaultData are final bytes produced by core.
 */
export interface VcpmDefinitionRepository {
  getAllVcpmModuleDefinitions(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]>;

  addVcpmDefaultData(
    subgraphSystemId: number,
    defaults: readonly VcpmDefaultData[],
  ): Promise<void>;
}
