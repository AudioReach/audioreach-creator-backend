/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {PropertyDefinitionReadModel} from '../../../ports/persistence/query-services/property-definition/property-definition-read-model.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {GetContainerPropertyDefinitionQuery} from './get-container-property-definition.query.js';
import {RESULT_KIND} from '../../../shared/result/result.js';

/**
 * Handler for GetContainerPropertyDefinitionQuery
 * Resolves projectId → fileId, then loads a single container property
 * definition by system ID.
 */
export class GetContainerPropertyDefinitionHandler implements QueryHandler<
  GetContainerPropertyDefinitionQuery,
  Promise<PropertyDefinitionReadModel>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetContainerPropertyDefinitionQuery,
  ): Promise<PropertyDefinitionReadModel> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.containerPropertyDefQueryService.getContainerPropertyDefinition(
        query.propertySystemId,
        fileId,
      );

    if (result.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        result.issues[0]?.message ??
          `Container property definition with system ID ${query.propertySystemId} not found`,
      );
    }

    return result.data;
  }
}
