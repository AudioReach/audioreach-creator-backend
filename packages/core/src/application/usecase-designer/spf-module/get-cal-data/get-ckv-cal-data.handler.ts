/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryHandler} from '../../../orchestration/cqrs/queries/query-handler.js';
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {GetCkvCalibrationDataQuery} from './get-ckv-cal-data.query.js';
import type {
  CkvCalibrationReadModel,
  ParameterCalibrationReadModel,
} from './ckv-calibration-read-model.js';
import type {ParameterPayloadReadModel} from '../../../ports/persistence/query-services/spf-module/ckv/ckv-read-model.js';
import type {ParameterDefinitionReadModel} from '../../../ports/persistence/query-services/shared/parameter-definition-read-model.js';
import {parseParameterData} from '../param-parser/parse-elements.js';
import type {ElementCalData} from '../param-parser/types/element-cal-data.js';
import {ResourceNotFoundException} from '../../../../shared/exceptions/resource-not-found.exception.js';
import {
  NullPayloadError,
  ParameterDefinitionMissingError,
} from '../../../../shared/errors/parameter.errors.js';
import type {Logger} from '../../../../shared/types/logger.interface.js';

/**
 * Handles `GetCkvCalibrationDataQuery` by fetching CKV data, parameter payloads,
 * and parameter definitions in parallel, then merging them into a
 * `CkvCalibrationDataModel` with fully parsed binary payloads.
 *
 * Fetch strategy:
 * 1. Resolve `fileSystemId` from `projectId` via `ProjectQueryService`
 * 2. Resolve SPF module (including `moduleDefSystemId`) from `spfModuleSystemId` via `SpfModuleQueryService.findOne`
 * 3. Fetch CKV row, payload rows, and definition rows in parallel (`Promise.all`)
 * 4. Join payloads to definitions by `parameterSystemId → systemId`
 * 5. Parse each non-null payload with `ParameterDataParser`
 */
export class GetCkvCalibrationDataHandler implements QueryHandler<
  GetCkvCalibrationDataQuery,
  Promise<CkvCalibrationReadModel>
> {
  constructor(
    private readonly queryServices: QueryServices,
    private readonly logger?: Logger,
  ) {}

  async handle(
    query: GetCkvCalibrationDataQuery,
  ): Promise<CkvCalibrationReadModel> {
    // Step 1: resolve file system ID from project ID
    const fileSystemId =
      await this.queryServices.projectQueryService.getFileIdByProjectId(
        query.projectId,
      );

    // findOne throws ResourceNotFoundException on missing / underlying failure (FR-1.4)
    const spfModule = await this.queryServices.spfModuleQueryService.findOne(
      query.spfModuleSystemId,
      fileSystemId,
    );

    // Step 3: fetch CKV, payloads, and definitions in parallel
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

    // Detect which explicitly-requested parameter system IDs had no payload row.
    // Only computed when the caller provided a filter; if paramSystemIds is empty
    // it means "return all", so there is nothing to report as missing.
    const missingParamSystemIds =
      query.paramSystemIds.length > 0
        ? (() => {
            const returnedIds = new Set(payloads.map(p => p.parameterSystemId));
            return query.paramSystemIds.filter(id => !returnedIds.has(id));
          })()
        : undefined;

    return {
      ckv,
      parameters: this.buildParameterDataModels(payloads, parameterDefinitions),
      missingParamSystemIds:
        missingParamSystemIds && missingParamSystemIds.length > 0
          ? missingParamSystemIds
          : undefined,
    };
  }

  /**
   * Joins payload rows to definition rows by `parameterSystemId → systemId`,
   * then parses each non-null payload with `ParameterDataParser`.
   *
   * Throws `ParameterDefinitionMissingError` when a payload is present but its
   * definition is absent — a database integrity violation that must not be silently
   * swallowed as a null result.
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

      const parsedData: ElementCalData[] = parseParameterData(
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
        isHidden: undefined, // TODO: not present in ParameterDefinitionReadModel yet — add when DB schema exposes it
        pidType:
          def.pidType as import('../../../../domain/entities/definitions/common/types/param-type.js').ParamType,
        parsedData,
      };
    });
  }
}
