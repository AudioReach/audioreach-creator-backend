/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetCkvCalibrationDataQuery} from './get-ckv-cal-data.query.js';
import type {ParameterPayloadReadModel} from '../../../ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {CkvCalDataDto} from './ckv-cal-data-dto.js';
import {mapCkvCalDataDto} from './ckv-cal-data-dto.js';
import {buildParameterModels} from '../../shared/build-parameter-models.js';

export class GetCkvCalibrationDataHandler implements QueryHandler<
  GetCkvCalibrationDataQuery,
  Promise<Result<CkvCalDataDto>>
> {
  constructor(
    private readonly queryServices: QueryServices,
    private readonly logger?: Logger,
  ) {}

  async handle(
    query: GetCkvCalibrationDataQuery,
  ): Promise<Result<CkvCalDataDto>> {
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    const spfModuleResult =
      await this.queryServices.spfModuleQueryService.getSpfModule(
        query.spfModuleSystemId,
        fileSystemId,
      );
    if (spfModuleResult.kind === RESULT_KIND.Fail) {
      throw new ResourceNotFoundException(
        `SpfModule ${query.spfModuleSystemId} not found`,
        spfModuleResult.issues,
      );
    }
    const spfModule = spfModuleResult.data;

    const [ckv, payloads] = await Promise.all([
      this.queryServices.spfModuleQueryService.ckvQueryService.getCkv(
        fileSystemId,
        query.spfModuleSystemId,
        query.ckvSystemId,
      ),
      this.queryServices.spfModuleQueryService.ckvQueryService.getCkvPayloads(
        fileSystemId,
        query.spfModuleSystemId,
        query.ckvSystemId,
        query.paramSystemIds,
      ),
    ]);

    const relevantParamSystemIds = payloads.map(
      (p: ParameterPayloadReadModel) => p.systemId,
    );
    const parameterDefinitions =
      await this.queryServices.spfModuleDefinitionQueryService.queryParameterDefinitions(
        fileSystemId,
        spfModule.definitionSystemId,
        relevantParamSystemIds,
      );

    if (!ckv) {
      throw new ResourceNotFoundException(
        `Ckv with systemId ${query.ckvSystemId} not found`,
      );
    }

    const missingParamSystemIds =
      query.paramSystemIds.length > 0
        ? (() => {
            const returnedIds = new Set(
              payloads.map((p: ParameterPayloadReadModel) => p.systemId),
            );
            return query.paramSystemIds.filter(id => !returnedIds.has(id));
          })()
        : undefined;

    const parameters = buildParameterModels(
      payloads,
      parameterDefinitions,
      this.logger,
    );

    const dto = mapCkvCalDataDto(ckv, parameters);

    if (missingParamSystemIds && missingParamSystemIds.length > 0) {
      const issues = missingParamSystemIds.map(id =>
        IssueFactory.paramPayloadNotFound(id),
      );
      return Result.partial(dto, issues);
    }

    return Result.ok(dto);
  }
}
