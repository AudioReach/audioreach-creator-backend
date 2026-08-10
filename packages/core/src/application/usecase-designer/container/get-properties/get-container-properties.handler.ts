/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetContainerPropertiesQuery} from './get-container-properties.query.js';
import {buildPropertyModels} from '../../shared/build-property-models.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {mapPropertyToDto} from '../../../../shared/dto/property-dto.js';
import {
  mapContainerProperties,
  type ContainerPropertiesDto,
} from '../dto/container-properties-dto.js';

export class GetContainerPropertiesHandler implements QueryHandler<
  GetContainerPropertiesQuery,
  Promise<Result<ContainerPropertiesDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetContainerPropertiesQuery,
  ): Promise<Result<ContainerPropertiesDto>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const payloadsResult =
      await this.queryServices.containerQueryService.findPropertyPayloads(
        query.containerSystemId,
        fileSystemId,
      );

    if (payloadsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        payloadsResult.issues[0]?.message ??
          'Failed to load container properties',
      );
    }
    if (payloadsResult.data === null) {
      throw new ResourceNotFoundException(
        `Container with systemId ${query.containerSystemId} not found`,
      );
    }
    const payloads = payloadsResult.data;

    const definitionsResult =
      await this.queryServices.containerPropertyDefQueryService.getAllDetailedContainerPropertyDefinitionsWithElements(
        fileSystemId,
      );

    if (definitionsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        definitionsResult.issues[0]?.message ??
          'Failed to load property definitions',
      );
    }

    const defMap = new Map(definitionsResult.data.map(d => [d.systemId, d]));
    const rawResult = buildPropertyModels(payloads, defMap);

    if (rawResult.kind === RESULT_KIND.Fail) return rawResult;

    const dtos = rawResult.data.map(p => mapPropertyToDto(p));

    if (rawResult.kind === RESULT_KIND.Partial)
      return Result.partial(mapContainerProperties(dtos), rawResult.issues);
    return Result.ok(mapContainerProperties(dtos), rawResult.issues);
  }
}
