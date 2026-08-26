/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetContainerPropertyQuery} from './get-container-property.query.js';
import type {PropertyDataDto} from '../../shared/property-read-model.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {parseParameterData} from '../../shared/parse-elements.js';

export class GetContainerPropertyHandler implements QueryHandler<
  GetContainerPropertyQuery,
  Promise<Result<PropertyDataDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(
    query: GetContainerPropertyQuery,
  ): Promise<Result<PropertyDataDto>> {
    // Step 1: resolve fileSystemId from projectId
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // Step 2: fetch all property payloads for the container (overlay-aware)
    const payloadsResult =
      await this.queryServices.containerQueryService.findPropertyPayloads(
        query.containerSystemId,
        fileSystemId,
      );

    if (payloadsResult.kind === RESULT_KIND.Fail) {
      throw new Error(
        payloadsResult.issues[0]?.message ??
          'Failed to load container property',
      );
    }
    if (payloadsResult.data === null) {
      throw new ResourceNotFoundException(
        `Container with systemId ${query.containerSystemId} not found`,
      );
    }

    // Step 3: find the specific property payload by propertySystemId
    const payload = payloadsResult.data.find(
      p => p.propertySystemId === query.propertySystemId,
    );
    if (payload === undefined) {
      throw new ResourceNotFoundException(
        `Property ${query.propertySystemId} not found on container ${query.containerSystemId}`,
      );
    }

    // Step 4: fetch property definition with elementsStructure
    const defResult =
      await this.queryServices.containerPropertyDefQueryService.getContainerPropertyDefinitionWithElements(
        query.propertySystemId,
        fileSystemId,
      );
    if (defResult.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        `Property definition ${query.propertySystemId} not found`,
      );
    }
    const def = defResult.data;

    // Step 5: parse binary payload into ElementData[]; null payload means no data yet
    const elements =
      payload.payload !== null
        ? parseParameterData(payload.payload, def.elementsStructure)
        : [];

    return Result.ok({
      systemId: payload.systemId,
      propertyId: def.propertyId,
      propertyName: def.name,
      elements,
    });
  }
}
