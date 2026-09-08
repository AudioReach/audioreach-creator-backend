/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetVcpmCkvQuery} from './get-vcpm-ckv.query.js';
import type {VcpmCkvDto} from '../dto/subgraph-write-result-types.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {ParameterDefinitionMissingError} from '../../../../shared/errors/parameter.errors.js';

export class GetVcpmCkvHandler implements QueryHandler<
  GetVcpmCkvQuery,
  Promise<Result<VcpmCkvDto>>
> {
  constructor(private readonly queryServices: QueryServices) {}

  async handle(query: GetVcpmCkvQuery): Promise<Result<VcpmCkvDto>> {
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

    const instance =
      await this.queryServices.vcpmQueryService.getVcpmInstanceBySubgraph(
        query.subgraphSystemId,
        fileSystemId,
      );
    if (!instance) {
      return Result.ok({configuredParams: []});
    }

    // Payloads are used only to identify which parameters are configured — the binary
    // payload content is not read here. Null payloads are valid (parameter configured
    // but not yet written) and are intentionally not treated as an error at this layer.
    const allPayloads =
      await this.queryServices.vcpmQueryService.getVcpmParameterPayloadsByInstance(
        instance.systemId,
        query.subgraphSystemId,
        fileSystemId,
      );

    const uniqueParamIds = [
      ...new Set(allPayloads.map(p => p.vcpmParameterSystemId)),
    ];
    if (uniqueParamIds.length === 0) {
      return Result.ok({configuredParams: []});
    }

    const [ckvs, paramDefs] = await Promise.all([
      this.queryServices.vcpmQueryService.getVcpmCkvsByInstance(
        instance.systemId,
        query.subgraphSystemId,
        fileSystemId,
      ),
      this.queryServices.vcpmQueryService.getVcpmParameterDefinitions(
        uniqueParamIds,
      ),
    ]);
    const defMap = new Map(paramDefs.map(d => [d.systemId, d]));

    const configuredParams = uniqueParamIds.map(paramId => {
      const def = defMap.get(paramId);
      if (def === undefined) {
        throw new ParameterDefinitionMissingError(paramId);
      }
      return {
        paramSystemId: String(paramId),
        paramName: def.name,
        associatedCkvs: ckvs
          .filter(ckv =>
            allPayloads.some(
              p =>
                p.vcpmParameterSystemId === paramId &&
                p.vcpmCkvSystemId === ckv.systemId,
            ),
          )
          .map(ckv => ({
            ckvSystemId: String(ckv.systemId),
            ckv: ckv.values,
          })),
      };
    });

    return Result.ok({configuredParams});
  }
}
