/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {ModuleRepository} from '../../../ports/persistence/repositories/module/module.repository.js';
import type {
  ModuleDefinitionRepository,
  ModuleParameterDefinition,
} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import {RESULT_KIND, Result} from '../../../shared/result/result.js';
import type {Result as ResultType} from '../../../shared/result/result.js';
import type {CkvDto, ParamInfoDto} from '../query/spf-module-dto.js';
import type {KeyValueInfoDto} from '../../../../shared/dto/key-value-info-dto.js';
import {ERROR_CODES} from '../../../../shared/errors/error-codes.js';
import type {Issue} from '../../../../shared/issues/issue.js';

export function mapSupportedParameters(
  definitions: readonly ModuleParameterDefinition[],
): ParamInfoDto[] {
  return definitions.map(definition => ({
    systemId: String(definition.systemId),
    naturalId: definition.naturalId ?? 0,
    name: definition.name ?? '',
    description: definition.description ?? '',
  }));
}

export async function resolveKeyValuePairs(
  valueDefinitionSystemIds: readonly number[],
  fileSystemId: number,
  kvRepo: ModuleRepository,
): Promise<ResultType<KeyValueInfoDto[]>> {
  const result = await kvRepo.getKeyValueSummaryForGivenValues(
    [...valueDefinitionSystemIds],
    fileSystemId,
  );
  if (result.kind === RESULT_KIND.Fail) {
    return Result.fail(...result.issues);
  }

  const keyValuePairs: KeyValueInfoDto[] = result.data.map(({key, value}) => ({
    key: {
      systemId: String(key.systemId),
      naturalId: key.naturalId,
      name: key.name,
    },
    value: {
      systemId: String(value.systemId),
      naturalId: value.naturalId,
      name: value.name,
    },
  }));
  return result.kind === RESULT_KIND.Partial
    ? Result.partial(keyValuePairs, result.issues)
    : Result.ok(keyValuePairs);
}

export function throwOnUnexpectedKvResolutionFailure(
  result: ResultType<KeyValueInfoDto[]>,
): void {
  if (
    result.kind === RESULT_KIND.Fail &&
    result.issues.some(issue => issue.code !== ERROR_CODES.ENTITY_NOT_FOUND)
  ) {
    throw new Error(result.issues.map(issue => issue.message).join('; '));
  }
}

/**
 * Resolves display labels for an already-validated key-value entity (e.g. a
 * CKV/TKV being removed). Unlike the add-path, missing labels never abort
 * the operation itself — throwOnUnexpectedKvResolutionFailure only throws on
 * genuine failures, and any tolerated ENTITY_NOT_FOUND issues are surfaced to
 * the caller instead of being dropped or turned into a hard failure.
 */
export function resolveDisplayValues(result: ResultType<KeyValueInfoDto[]>): {
  data: KeyValueInfoDto[];
  issues: readonly Issue[];
} {
  if (result.kind === RESULT_KIND.Ok) {
    return {data: result.data, issues: result.issues ?? []};
  }
  throwOnUnexpectedKvResolutionFailure(result);
  return {
    data: result.kind === RESULT_KIND.Partial ? result.data : [],
    issues: result.issues,
  };
}

export function buildKvResponse(
  systemId: number,
  keyValuePairs: KeyValueInfoDto[],
  parameterDefinitions: readonly ModuleParameterDefinition[],
): CkvDto {
  return {
    systemId: String(systemId),
    keyValuePairs,
    supportedParameters: mapSupportedParameters(parameterDefinitions),
  };
}

/**
 * Builds the DTO for a CKV or TKV that has just been removed. The caller
 * pre-fetches the parameterSystemIds from the appropriate payload table
 * (getCkvPayloadEntries / getTkvPayloadEntries) before calling this.
 */
export async function buildRemovedKvDto(
  kv: {systemId: number; valueDefinitionSystemIds: readonly number[]},
  parameterSystemIds: number[],
  definitionSystemId: number,
  fileSystemId: number,
  defRepo: ModuleDefinitionRepository,
  kvRepo: ModuleRepository,
): Promise<{dto: CkvDto; issues: readonly Issue[]}> {
  const paramDefs =
    parameterSystemIds.length === 0
      ? []
      : await defRepo.getParameterDefinitions(
          definitionSystemId,
          parameterSystemIds,
        );
  const resolvedValues = await resolveKeyValuePairs(
    kv.valueDefinitionSystemIds,
    fileSystemId,
    kvRepo,
  );
  const {data, issues} = resolveDisplayValues(resolvedValues);
  return {dto: buildKvResponse(kv.systemId, data, paramDefs), issues};
}
