/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KeyValueInfoDto} from '../../../../usecase-designer/spf-module/query/spf-module-dto.js';

export interface VcpmInstanceReadModel {
  systemId: number;
  subgraphSystemId: number;
}

export interface VcpmCkvReadModel {
  systemId: number;
  values: KeyValueInfoDto[];
}

export interface VcpmParameterPayloadReadModel {
  systemId: number;
  vcpmParameterSystemId: number;
  vcpmCkvSystemId: number;
  payload: Uint8Array | null;
}

export interface VcpmParameterDefinitionReadModel {
  systemId: number;
  paramId: number;
  name: string;
  isReadOnly: boolean;
  elementsStructure: string;
}

export interface VcpmQueryService {
  getVcpmInstanceBySubgraph(
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<VcpmInstanceReadModel | null>;

  getVcpmCkvsByInstance(
    vcpmInstanceSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<VcpmCkvReadModel[]>;

  // Returns null if the CKV does not exist or was deleted under this subgraph
  getVcpmCkv(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<VcpmCkvReadModel | null>;

  // When paramSystemIds is provided, only those parameters are returned
  getVcpmParameterPayloads(
    ckvSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
    paramSystemIds?: number[],
  ): Promise<VcpmParameterPayloadReadModel[]>;

  getVcpmParameterPayloadsByInstance(
    vcpmInstanceSystemId: number,
    subgraphSystemId: number,
    fileSystemId: number,
  ): Promise<VcpmParameterPayloadReadModel[]>;

  getVcpmParameterDefinitions(
    paramSystemIds: number[],
  ): Promise<VcpmParameterDefinitionReadModel[]>;
}
