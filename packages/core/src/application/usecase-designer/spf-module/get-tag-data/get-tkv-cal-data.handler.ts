/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetTkvCalibrationDataQuery} from './get-tkv-cal-data.query.js';
import type {ParameterPayloadReadModel} from '../../../ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {IssueFactory} from '../../../../shared/issues/factories.js';
import type {TkvCalDataDto} from './tkv-cal-data-dto.js';
import {mapTkvCalDataDto} from './tkv-cal-data-dto.js';
import {buildParameterModels} from '../../shared/build-parameter-models.js';

export class GetTkvCalibrationDataHandler implements QueryHandler<
  GetTkvCalibrationDataQuery,
  Promise<Result<TkvCalDataDto>>
> {
  constructor(
    private readonly queryServices: QueryServices,
    private readonly logger?: Logger,
  ) {}

  async handle(
    query: GetTkvCalibrationDataQuery,
  ): Promise<Result<TkvCalDataDto>> {
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

    const [tkv, payloads] = await Promise.all([
      this.queryServices.spfModuleQueryService.tkvQueryService.getTkv(
        fileSystemId,
        query.spfModuleSystemId,
        query.tkvSystemId,
      ),
      this.queryServices.spfModuleQueryService.tkvQueryService.getTkvPayloads(
        fileSystemId,
        query.spfModuleSystemId,
        query.tkvSystemId,
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

    if (!tkv) {
      throw new ResourceNotFoundException(
        `Tkv with systemId ${query.tkvSystemId} not found`,
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
    const dto = mapTkvCalDataDto(tkv, parameters);

    if (missingParamSystemIds && missingParamSystemIds.length > 0) {
      const issues = missingParamSystemIds.map(id =>
        IssueFactory.paramPayloadNotFound(id),
      );
      return Result.partial(dto, issues);
    }

    return Result.ok(dto);
  }
}
