/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetVcpmCalDataQuery} from './get-vcpm-cal-data.query.js';
import type {CkvCalDataDto} from '../../spf-module/get-cal-data/ckv-cal-data-dto.js';
import type {ParameterDto} from '../../spf-module/dto/parameter-dto.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {ParameterDefinitionMissingError} from '../../../../shared/errors/parameter.errors.js';
import {parseParameterData} from '../../shared/parse-elements.js';
import {mapElements} from '../../spf-module/get-cal-data/ckv-cal-data-dto.js';

export class GetVcpmCalDataHandler implements QueryHandler<
  GetVcpmCalDataQuery,
  Promise<Result<CkvCalDataDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetVcpmCalDataQuery): Promise<Result<CkvCalDataDto>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const subgraphResult =
      await this.queryServices.subgraphQueryService.findPropertyPayloads(
        query.subgraphSystemId,
        fileSystemId,
      );
    if (subgraphResult.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        `Subgraph ${query.subgraphSystemId} not found`,
        subgraphResult.issues,
      );
    }
    if (subgraphResult.data === null) {
      throw new ResourceNotFoundException(
        `Subgraph ${query.subgraphSystemId} not found`,
      );
    }

    const aggregateResult =
      await this.queryServices.subgraphQueryService.getVcpmAggregateBySubgraph(
        query.subgraphSystemId,
        fileSystemId,
        {
          ckvSystemId: query.ckvSystemId,
          paramSystemIds:
            query.paramSystemIds.length > 0 ? query.paramSystemIds : undefined,
        },
      );
    if (aggregateResult.kind === RESULT_KIND.Fail) {
      throw new Error('Failed to load VCPM aggregate');
    }

    const aggregate = aggregateResult.data;
    const ckv = aggregate.ckvs.find(
      candidate => candidate.systemId === query.ckvSystemId,
    );
    if (ckv === undefined) {
      throw new ResourceNotFoundException(`CKV ${query.ckvSystemId} not found`);
    }

    const definitionById = new Map(
      aggregate.parameterDefinitions.map(definition => [
        definition.systemId,
        definition,
      ]),
    );

    const parameters = aggregate.payloads.map(payload => {
      const definition = definitionById.get(payload.vcpmParameterSystemId);
      if (definition === undefined) {
        throw new ParameterDefinitionMissingError(
          payload.vcpmParameterSystemId,
        );
      }
      const elements: ParameterDto['elements'] = payload.payload
        ? (mapElements(
            parseParameterData(payload.payload, definition.elementsStructure),
          ) as ParameterDto['elements'])
        : [];
      return {
        systemId: String(payload.systemId),
        naturalId: String(definition.paramId),
        name: definition.name,
        isReadOnly: definition.isReadOnly,
        elements,
      };
    });

    return Result.ok({
      systemId: String(ckv.systemId),
      Ckv: ckv.values,
      parameters,
    });
  }
}
