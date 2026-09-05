/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {assertNonNull, invariant} from '../../../../shared/assertions/index.js';
import type {UsecaseType} from './usecase-type.js';

export interface KeyVectorInput {
  valueSystemIds: number[];
}

/**
 * A directional subgraph pair belonging to a UseCase.
 * Direction is encoded by field order: source to destination.
 */
export interface SubgraphPair {
  sourceSubgraphSystemId: number;
  destSubgraphSystemId: number;
}

export interface UseCaseInit {
  systemId: number;
  fileSystemId: number;
  keyVector: KeyVectorInput;
  alias?: string;
  aliasId?: number;
  categories?: string[];
  subgraphSystemIds: number[];
  subgraphPairs: SubgraphPair[];
  type?: UsecaseType;
  orderedKeys?: Array<{id: number}>;
  reviewedAt?: string;
}

export class UseCase {
  readonly systemId: number;
  readonly fileSystemId: number;
  readonly subgraphSystemIds: number[] = [];
  readonly subgraphPairs: SubgraphPair[] = [];
  readonly keyVector: KeyVectorInput;

  alias?: string;
  aliasId?: number;
  categories?: string[];
  type?: UsecaseType;
  orderedKeys?: Array<{id: number}>;
  reviewedAt?: string;

  private readonly subgraphIdSet = new Set<number>();
  private readonly subgraphPairKeys = new Set<string>();

  constructor(initParams: UseCaseInit) {
    this.systemId = initParams.systemId;
    this.fileSystemId = initParams.fileSystemId;
    this.keyVector = initParams.keyVector;
    this.alias = initParams.alias;
    this.aliasId = initParams.aliasId;
    this.categories = initParams.categories;
    this.type = initParams.type;
    this.orderedKeys = initParams.orderedKeys;
    this.reviewedAt = initParams.reviewedAt;
    for (const id of initParams.subgraphSystemIds) {
      this.AddSubgraph(id);
    }
    for (const pair of initParams.subgraphPairs) {
      this.AddSubgraphPair(
        pair.sourceSubgraphSystemId,
        pair.destSubgraphSystemId,
      );
    }
  }

  private AddSubgraph(subgraphSystemId: number): void {
    assertNonNull(
      subgraphSystemId,
      `subgraphSystemId is null in UseCase ${this.systemId}`,
    );
    invariant(
      !this.subgraphIdSet.has(subgraphSystemId),
      `Subgraph ${subgraphSystemId} already exists in UseCase ${this.systemId}`,
    );
    this.subgraphIdSet.add(subgraphSystemId);
    this.subgraphSystemIds.push(subgraphSystemId);
  }

  private AddSubgraphPair(
    sourceSubgraphSystemId: number,
    destSubgraphSystemId: number,
  ): void {
    assertNonNull(
      sourceSubgraphSystemId,
      `sourceSubgraphSystemId is null in UseCase ${this.systemId}`,
    );
    assertNonNull(
      destSubgraphSystemId,
      `destSubgraphSystemId is null in UseCase ${this.systemId}`,
    );
    const key = `${sourceSubgraphSystemId}:${destSubgraphSystemId}`;
    invariant(
      !this.subgraphPairKeys.has(key),
      `Subgraph pair (${sourceSubgraphSystemId}, ${destSubgraphSystemId}) already exists in UseCase ${this.systemId}`,
    );
    this.subgraphPairKeys.add(key);
    this.subgraphPairs.push({sourceSubgraphSystemId, destSubgraphSystemId});
  }
}
