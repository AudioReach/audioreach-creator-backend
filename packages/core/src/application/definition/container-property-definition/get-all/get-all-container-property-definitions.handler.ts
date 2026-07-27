/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {PropertyDefinitionSummaryReadModel} from '../../../ports/persistence/query-services/property-definition/property-definition-read-model.js';
import {GetAllContainerPropertyDefinitionsQuery} from './get-all-container-property-definitions.query.js';
import type {Result} from '../../../shared/result/result.js';

/**
 * Handler for GetAllContainerPropertyDefinitionsQuery
 * Resolves projectId → fileId, then lists container property definitions for that file.
 * Forwards the Result straight through — the controller decides the HTTP status.
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

    return this.queryServices.containerPropertyDefQueryService.getAllContainerPropertyDefinitions(
      fileId,
      query.propertyDefinitionId,
    );
  }
}
