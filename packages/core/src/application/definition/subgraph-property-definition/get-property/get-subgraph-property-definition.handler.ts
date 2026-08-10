/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {GetSubgraphPropertyDefinitionQuery} from './get-subgraph-property-definition.query.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import {
  mapSubgraphPropertyDefinition,
  type SubgraphPropertyDefinitionDto,
} from '../dto/subgraph-property-definition-dto.js';

/**
 * Handler for GetSubgraphPropertyDefinitionQuery
 * Resolves projectId → fileId, then loads a single subgraph property
 * definition by system ID.
 */
export class GetSubgraphPropertyDefinitionHandler implements QueryHandler<
  GetSubgraphPropertyDefinitionQuery,
  Promise<SubgraphPropertyDefinitionDto>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetSubgraphPropertyDefinitionQuery,
  ): Promise<SubgraphPropertyDefinitionDto> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.subgraphPropertyDefQueryService.getSubgraphPropertyDefinition(
        query.propertySystemId,
        fileId,
      );

    if (result.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        result.issues[0]?.message ??
          `Subgraph property definition with system ID ${query.propertySystemId} not found`,
      );
    }

    return mapSubgraphPropertyDefinition(result.data);
  }
}
