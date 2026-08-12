/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetCkvCalibrationDataQuery} from './get-ckv-cal-data.query.js';
import type {ParameterCalibrationReadModel} from './ckv-calibration-read-model.js';
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
import {Result} from '../../../shared/result/result.js';
import {ISSUE_CODE} from '../../../../shared/issues/operational-codes.js';
import {IssueSeverity} from '../../../../shared/issues/severity.js';
import type {CkvCalDataDto} from './ckv-cal-data-dto.js';
import {mapCkvCalDataDto} from './ckv-cal-data-dto.js';
import type {ParamType} from '../../../../domain/entities/definitions/common/types/param-type.js';

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

    const spfModule =
      await this.queryServices.spfModuleQueryService.getSpfModule(
        query.spfModuleSystemId,
        fileSystemId,
      );

    const [ckv, payloads, parameterDefinitions] = await Promise.all([
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
      this.queryServices.spfModuleDefinitionQueryService.queryParameterDefinitions(
        fileSystemId,
        spfModule.definitionSystemId,
        query.paramSystemIds,
      ),
    ]);

    if (!ckv) {
      throw new ResourceNotFoundException(
        `Ckv with systemId ${query.ckvSystemId} not found`,
      );
    }

    const missingParamSystemIds =
      query.paramSystemIds.length > 0
        ? (() => {
            const returnedIds = new Set(
              payloads.map(
                (p: ParameterPayloadReadModel) => p.parameterSystemId,
              ),
            );
            return query.paramSystemIds.filter(id => !returnedIds.has(id));
          })()
        : undefined;

    const parameters = this.buildParameterDataModels(
      payloads,
      parameterDefinitions,
    );

    const dto = mapCkvCalDataDto(ckv, parameters);

    if (missingParamSystemIds && missingParamSystemIds.length > 0) {
      const issues = missingParamSystemIds.map(id => ({
        code: ISSUE_CODE.PARAM_PAYLOAD_NOT_FOUND,
        message: `No calibration payload found for parameter system ID ${id}`,
        severity: IssueSeverity.Error,
      }));
      return Result.partial(dto, issues);
    }

    return Result.ok(dto);
  }

  /**
   * Joins payload rows to definition rows by parameterSystemId → systemId,
   * then parses each non-null payload with ParameterDataParser.
   *
   * Throws ParameterDefinitionMissingError when a payload is present but its
   * definition is absent — a database integrity violation that must not be silently swallowed.
   */
  private buildParameterDataModels(
    payloads: ParameterPayloadReadModel[],
    definitions: ParameterDefinitionReadModel[],
  ): ParameterCalibrationReadModel[] {
    const defMap = new Map(definitions.map(d => [d.systemId, d]));

    return payloads.map(p => {
      if (p.payload === null) {
        throw new NullPayloadError(p.parameterSystemId);
      }

      const def = defMap.get(p.parameterSystemId);

      if (def === undefined) {
        throw new ParameterDefinitionMissingError(p.parameterSystemId);
      }

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
