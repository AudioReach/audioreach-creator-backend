/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetSubgraphPropertiesQuery} from './get-subgraph-properties.query.js';
import type {PropertyDataDto} from '../../shared/property-read-model.js';
import {buildPropertyModels} from '../../shared/build-property-models.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';

export class GetSubgraphPropertiesHandler implements QueryHandler<
  GetSubgraphPropertiesQuery,
  Promise<Result<PropertyDataDto[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetSubgraphPropertiesQuery,
  ): Promise<Result<PropertyDataDto[]>> {
    // Step 1: resolve fileSystemId from projectId
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // Step 2+3: existence check + payload fetch via SubgraphOverlayFetcher
    const payloadsResult =
      await this.queryServices.subgraphQueryService.findPropertyPayloads(
        query.subgraphSystemId,
        fileSystemId,
      );

    if (payloadsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        payloadsResult.issues[0]?.message ??
          'Failed to load subgraph properties',
      );
    }
    if (payloadsResult.data === null) {
      throw new ResourceNotFoundException(
        `Subgraph with systemId ${query.subgraphSystemId} not found`,
      );
    }
    const payloads = payloadsResult.data;

    // Step 4: fetch definitions with elementsStructure
    const definitionsResult =
      await this.queryServices.subgraphPropertyDefQueryService.getAllDetailedSubgraphPropertyDefinitionsWithElements(
        fileSystemId,
      );

    if (definitionsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        definitionsResult.issues[0]?.message ??
          'Failed to load subgraph property definitions',
      );
    }

    // Step 5: build defMap and delegate to shared utility
    const defMap = new Map(definitionsResult.data.map(d => [d.systemId, d]));
    return buildPropertyModels(payloads, defMap);
  }
}
