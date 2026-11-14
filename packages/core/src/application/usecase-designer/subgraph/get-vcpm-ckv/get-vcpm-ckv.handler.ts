/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetVcpmCkvQuery} from './get-vcpm-ckv.query.js';
import type {VcpmCkvDto} from '../dto/subgraph-write-result-types.js';
import {Result} from '../../../shared/result/result.js';
import {requireOne} from '../../../shared/result/require-one.js';
import {ParameterDefinitionMissingError} from '../../../../shared/errors/parameter.errors.js';
import {CONFIGURATION_INCLUDES} from '../../../ports/persistence/query-services/configuration-includes.js';

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

    const {subgraphQueryService} = this.queryServices;
    requireOne(
      await subgraphQueryService.findSubgraphs(
        fileSystemId,
        [query.subgraphSystemId],
        CONFIGURATION_INCLUDES.Summary,
      ),
    );

    const aggregate = await subgraphQueryService.findVcpmAggregate(
      fileSystemId,
      query.subgraphSystemId,
    );
    if (aggregate.parameterCkvLinks.length === 0) {
      return Result.ok({configuredParams: []});
    }

    const definitionById = new Map(
      aggregate.parameterDefinitions.map(definition => [
        definition.systemId,
        definition,
      ]),
    );
    const ckvById = new Map(aggregate.ckvs.map(ckv => [ckv.systemId, ckv]));

    const configuredParams = aggregate.parameterCkvLinks.map(link => {
      const definition = definitionById.get(link.parameterSystemId);
      if (definition === undefined) {
        throw new ParameterDefinitionMissingError(link.parameterSystemId);
      }
      return {
        paramSystemId: String(link.parameterSystemId),
        paramName: definition.name,
        associatedCkvs: link.ckvSystemIds.map(ckvSystemId => {
          const ckv = ckvById.get(ckvSystemId);
          if (ckv === undefined) {
            throw new Error(`Missing CKV ${ckvSystemId} in VCPM summary`);
          }
          return {
            ckvSystemId: String(ckv.systemId),
            ckv: ckv.values,
          };
        }),
      };
    });

    return Result.ok({configuredParams});
  }
}
