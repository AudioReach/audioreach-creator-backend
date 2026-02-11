/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {KvData} from '../../../common/entities/kv-data.js';
import {CkvCollection} from '../../../common/entities/ckv-collection.js';

export interface VcpmModuleInstanceInit {
  systemId: number;
  subgraphSystemId: number;
  vcpmDefinitionId: number;
}
export class VcpmInstance {
  private readonly ckvCollection = new CkvCollection();

  readonly systemId: number;
  readonly subgraphSystemId: number;
  readonly vcpmModuleDefinitionId: number;

  get ckvs(): readonly KvData[] {
    return this.ckvCollection.ckvs;
  }

  constructor(initParams: VcpmModuleInstanceInit) {
    this.systemId = initParams.systemId;
    this.subgraphSystemId = initParams.subgraphSystemId;
    this.vcpmModuleDefinitionId = initParams.vcpmDefinitionId;
  }

  addCkv(kvData: KvData) {
    this.ckvCollection.addCkv(kvData);
  }
}
