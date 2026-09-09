/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export interface VcpmModuleDefinitionWithParamsReadModel {
  systemId: number;
  moduleDefinitionId: number;
  parameters: Array<{
    systemId: number;
    paramId: number;
    elementsStructure: string;
    isReadOnly: boolean;
  }>;
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
 * Payload bytes in addVcpmCfgDefaultData are final bytes produced by core.
 */
export interface VcpmDefinitionRepository {
  getAllVcpmModuleDefinitions(
    fileSystemId: number,
  ): Promise<VcpmModuleDefinitionWithParamsReadModel[]>;

  addVcpmCfgDefaultData(
    subgraphSystemId: number,
    defaults: readonly VcpmDefaultData[],
  ): Promise<void>;
}
