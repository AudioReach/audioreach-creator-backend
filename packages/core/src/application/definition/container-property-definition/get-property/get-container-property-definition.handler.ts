/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {GetContainerPropertyDefinitionQuery} from './get-container-property-definition.query.js';
import {RESULT_KIND} from '../../../shared/result/result.js';
import {
  mapContainerPropertyDefinition,
  type ContainerPropertyDefinitionDto,
} from '../dto/container-property-definition-dto.js';

/**
 * Handler for GetContainerPropertyDefinitionQuery
 * Resolves projectId → fileId, then loads a single container property
 * definition by system ID.
 */
export class GetContainerPropertyDefinitionHandler implements QueryHandler<
  GetContainerPropertyDefinitionQuery,
  Promise<ContainerPropertyDefinitionDto>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetContainerPropertyDefinitionQuery,
  ): Promise<ContainerPropertyDefinitionDto> {
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

    return mapContainerPropertyDefinition(result.data);
  }
}
