/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {VcpmInstance} from './entities/vcpm-module-instance.js';
import {SubgraphPropertyData} from './value-objects/subgraph-property.js';

export interface SubgraphInit {
  systemId: number;
  subgraphId: number;
  name: string;
  isExported: boolean;
  fileSystemId: number;
  vcpmDataInstance?: VcpmInstance;
}

export class DuplicateSubgraphPropertyException extends Error {
  constructor(propId: number) {
    super(`Property with ${propId} already exists`);
    this.name = 'DuplicateSubgraphPropertyException';
  }
}

export class Subgraph {
  private propertyIds = new Set<number>();

  readonly systemId: number;
  readonly subgraphId: number;
  readonly name: string;
  readonly isExported: boolean;
  readonly fileSystemId: number;
  readonly vcpmDataInstance: VcpmInstance | null;
  readonly properties: SubgraphPropertyData[] = [];

  constructor(initParams: SubgraphInit) {
    this.systemId = initParams.systemId;
    this.subgraphId = initParams.subgraphId;
    this.name = initParams.name;
    this.isExported = initParams.isExported;
    this.fileSystemId = initParams.fileSystemId;
    this.vcpmDataInstance = initParams.vcpmDataInstance ?? null;
  }

  addProperty(propertyData: SubgraphPropertyData) {
    if (this.propertyIds.has(propertyData.propertyDefinitionSystemId))
      throw new DuplicateSubgraphPropertyException(
        propertyData.propertyDefinitionSystemId,
      );
    this.propertyIds.add(propertyData.propertyDefinitionSystemId);
    this.properties.push(propertyData);
  }
}
