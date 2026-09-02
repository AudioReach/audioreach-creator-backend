/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetTkvCalibrationDataQuery} from './get-tkv-cal-data.query.js';
import type {ParameterCalibrationReadModel} from './tkv-calibration-read-model.js';
import type {ParameterPayloadReadModel} from '../../../ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import type {ParameterDefinitionReadModel} from '../../../ports/persistence/query-services/shared/parameter-definition-read-model.js';
import {parseParameterData} from '../../shared/parse-elements.js';
import type {ElementData} from '../../../../domain/entities/definitions/common/types/element-data.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {
  NullPayloadError,
  ParameterDefinitionMissingError,
} from '../../../../shared/errors/parameter.errors.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';
import {Result, RESULT_KIND} from '../../../shared/result/result.js';
import {ISSUE_CODE} from '../../../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import type {TkvCalDataDto} from './tkv-cal-data-dto.js';
import {mapTkvCalDataDto} from './tkv-cal-data-dto.js';
import type {ParamType} from '../../../../domain/entities/definitions/common/types/param-type.js';

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
        query.tagSystemId,
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
      (p: ParameterPayloadReadModel) => p.parameterSystemId,
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

    const parameters = this.buildParameterDataModels(
      payloads,
      parameterDefinitions,
    );
    const dto = mapTkvCalDataDto(tkv, parameters);

    if (missingParamSystemIds && missingParamSystemIds.length > 0) {
      const issues = missingParamSystemIds.map(id => ({
        code: ISSUE_CODE.PARAM_PAYLOAD_NOT_FOUND,
        message: `No tag data payload found for parameter system ID ${id}`,
        severity: IssueSeverity.Error,
      }));
      return Result.partial(dto, issues);
    }

    return Result.ok(dto);
  }

  private buildParameterDataModels(
    payloads: ParameterPayloadReadModel[],
    definitions: ParameterDefinitionReadModel[],
  ): ParameterCalibrationReadModel[] {
    const defMap = new Map(definitions.map(d => [d.systemId, d]));
    return payloads.map(p => {
      if (p.payload === null) throw new NullPayloadError(p.parameterSystemId);
      const def = defMap.get(p.parameterSystemId);
      if (def === undefined)
        throw new ParameterDefinitionMissingError(p.parameterSystemId);
      const parsedData: ElementData[] = parseParameterData(
        p.payload,
        def.elementsStructure ?? '',
        this.logger,
      );
      return {
        systemId: p.systemId,
        parameterId: def.paramId,
        name: def.name ?? String(def.paramId),
        description: def.description,
        isReadOnly: def.isReadOnly ?? false,
        isHidden: undefined,
        pidType: def.pidType as ParamType,
        parsedData,
      };
    });
  }
}
