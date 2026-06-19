/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {VcpmInstance} from './entities/vcpm-module-instance.js';
import {SubgraphPropertyData} from './value-objects/subgraph-property.js';
import {Sgkv} from './entities/sgkv.js';
import {invariant} from '../../../../shared/assertions/index.js';
import {BinaryUtils} from '../../../../shared/utilities/binary-utils.js';

export interface SubgraphInit {
  systemId: number;
  subgraphId: number;
  name: string;
  isExported: boolean;
  fileSystemId: number;
  sgkvs?: readonly Sgkv[];
  properties?: readonly SubgraphPropertyData[];
}

export class Subgraph {
  private readonly propertyIds = new Set<number>();
  private readonly sgkvKeys = new Set<string>();

  systemId: number;
  readonly subgraphId: number;
  readonly name: string;
  readonly isExported: boolean;
  fileSystemId: number;
  vcpmDataInstance: VcpmInstance | null;
  readonly properties: SubgraphPropertyData[] = [];
  readonly sgkvs: Sgkv[] = [];

  constructor(initParams: SubgraphInit) {
    this.systemId = initParams.systemId;
    this.subgraphId = initParams.subgraphId;
    this.name = initParams.name;
    this.isExported = initParams.isExported;
    this.fileSystemId = initParams.fileSystemId;
    this.vcpmDataInstance = null;
    for (const property of initParams.properties ?? []) {
      this.addProperty(property);
    }
    for (const sgkv of initParams.sgkvs ?? []) {
      this.addSgkv(sgkv);
    }
  }

  setVcpmDataInstance(instance: VcpmInstance): void {
    this.vcpmDataInstance = instance;
  }

  private addProperty(propertyData: SubgraphPropertyData): void {
    invariant(
      !this.propertyIds.has(propertyData.propertyDefinitionSystemId),
      `Property with systemId ${BinaryUtils.toHexString(propertyData.propertyDefinitionSystemId)} already exists for Subgraph (subgraphId=${BinaryUtils.toHexString(this.subgraphId)})`,
    );
    this.propertyIds.add(propertyData.propertyDefinitionSystemId);
    this.properties.push(propertyData);
  }

  private addSgkv(sgkv: Sgkv): void {
    const systemIdKey = `sys:${sgkv.systemId}`;
    const valuesKey = `vals:${[...sgkv.valueDefinitionSystemIds].sort((a, b) => a - b).join(',')}`;
    invariant(
      !this.sgkvKeys.has(systemIdKey),
      `SGKV with systemId ${sgkv.systemId} already exists for Subgraph (subgraphId=${BinaryUtils.toHexString(this.subgraphId)})`,
    );
    invariant(
      !this.sgkvKeys.has(valuesKey),
      `SGKV with valueDefinitionSystemIds already exists for Subgraph (subgraphId=${BinaryUtils.toHexString(this.subgraphId)})`,
    );
    this.sgkvKeys.add(systemIdKey);
    this.sgkvKeys.add(valuesKey);
    this.sgkvs.push(sgkv);
  }
}
