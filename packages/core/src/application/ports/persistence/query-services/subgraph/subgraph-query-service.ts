/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {BatchRead} from '../../batch-read.js';
import type {PropertyPayloadReadModel} from '../shared/property-payload-read-model.js';
import type {ConfigurationIncludes} from '../configuration-includes.js';
import type {SubgraphReadModel} from './subgraph-read-model.js';
import type {
  VcpmAggregateOptions,
  VcpmAggregateReadModel,
} from '../vcpm/vcpm-read-model.js';
import type {ENTITY_TYPE} from '../../../../../shared/entity-type.js';

/** The property payload rows of one subgraph. */
export interface SubgraphPropertyPayloadsReadModel {
  readonly subgraphSystemId: number;
  readonly properties: PropertyPayloadReadModel[];
}

/**
 * Subgraph reads, with the session overlay applied. All methods throw on
 * infrastructure errors.
 *
 * `includes`: `SUMMARY` loads scalar fields only (`sgkvs` is `null`);
 * `FULL_DETAILS` also loads SGKVs resolved to key/value pairs.
 */
export interface SubgraphQueryService {
  /**
   * The requested subgraphs, in request order. Missing IDs are reported in
   * `failed` as `NOT_FOUND`. With `FULL_DETAILS`, a subgraph whose SGKV
   * references a missing value definition is reported as
   * `UNRESOLVED_REFERENCE`, with its name and natural ID.
   */
  findSubgraphs(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
    includes: ConfigurationIncludes,
  ): Promise<BatchRead<SubgraphReadModel, typeof ENTITY_TYPE.Subgraph>>;

  /**
   * Every subgraph in the file. `failed` holds only `UNRESOLVED_REFERENCE`
   * entries, as for `findSubgraphs`.
   */
  findAllSubgraphs(
    fileSystemId: number,
    includes: ConfigurationIncludes,
  ): Promise<BatchRead<SubgraphReadModel, typeof ENTITY_TYPE.Subgraph>>;

  /**
   * The property payloads of each requested subgraph, in request order; a
   * subgraph may have none. Missing IDs are reported as `NOT_FOUND`.
   */
  findSubgraphPropertyPayloads(
    fileSystemId: number,
    subgraphSystemIds: readonly number[],
  ): Promise<
    BatchRead<SubgraphPropertyPayloadsReadModel, typeof ENTITY_TYPE.Subgraph>
  >;

  /**
   * The VCPM data of one subgraph. The caller checks that the subgraph
   * exists; an unknown subgraph yields an empty aggregate.
   */
  findVcpmAggregate(
    fileSystemId: number,
    subgraphSystemId: number,
    options?: VcpmAggregateOptions,
  ): Promise<VcpmAggregateReadModel>;
}
