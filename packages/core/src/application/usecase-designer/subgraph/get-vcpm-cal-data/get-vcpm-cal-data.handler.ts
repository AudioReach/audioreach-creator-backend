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

    const ckv = await this.queryServices.vcpmQueryService.getVcpmCkv(
      query.ckvSystemId,
      query.subgraphSystemId,
      fileSystemId,
    );
    if (!ckv) {
      throw new ResourceNotFoundException(`CKV ${query.ckvSystemId} not found`);
    }

    const payloads =
      await this.queryServices.vcpmQueryService.getVcpmParameterPayloads(
        query.ckvSystemId,
        query.subgraphSystemId,
        fileSystemId,
        query.paramSystemIds.length > 0 ? query.paramSystemIds : undefined,
      );

    const paramSystemIds = payloads.map(p => p.vcpmParameterSystemId);
    const paramDefs =
      await this.queryServices.vcpmQueryService.getVcpmParameterDefinitions(
        paramSystemIds,
      );
    const defMap = new Map(paramDefs.map(d => [d.systemId, d]));

    const parameters = payloads.map(p => {
      const def = defMap.get(p.vcpmParameterSystemId);
      if (def === undefined) {
        throw new ParameterDefinitionMissingError(p.vcpmParameterSystemId);
      }
      const elements: ParameterDto['elements'] = p.payload
        ? (mapElements(
            parseParameterData(p.payload, def.elementsStructure),
          ) as ParameterDto['elements'])
        : [];
      return {
        systemId: String(p.systemId),
        parameterId: String(def.paramId),
        name: def.name,
        isReadOnly: def.isReadOnly,
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
