/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {PropertyDefinitionSummaryReadModel} from '../../../ports/persistence/query-services/property-definition/property-definition-read-model.js';
import {GetAllContainerPropertyDefinitionsQuery} from './get-all-container-property-definitions.query.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';

/**
 * Handler for GetAllContainerPropertyDefinitionsQuery
 * Resolves projectId → fileId, then lists container property definitions for that file.
 * A Fail result is converted to ResourceNotFoundException — handlers must throw a
 * DomainException on failure, never let Result.fail() reach toApiResult.
 */
export class GetAllContainerPropertyDefinitionsHandler implements QueryHandler<
  GetAllContainerPropertyDefinitionsQuery,
  Promise<Result<PropertyDefinitionSummaryReadModel[]>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetAllContainerPropertyDefinitionsQuery,
  ): Promise<Result<PropertyDefinitionSummaryReadModel[]>> {
    const fileId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const result =
      await this.queryServices.containerPropertyDefQueryService.getAllContainerPropertyDefinitions(
        fileId,
        query.propertyDefinitionId,
      );

    if (result.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        result.issues[0]?.message ??
          `Failed to load container property definitions for project ${query.projectId}`,
      );
    }

    return result;
  }
}
