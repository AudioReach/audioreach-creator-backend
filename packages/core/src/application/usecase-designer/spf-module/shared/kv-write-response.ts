/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */
import type {QueryServices} from '../../../ports/persistence/query-services/query-services.js';
import type {ModuleParameterDefinition} from '../../../ports/persistence/repositories/module/module-definition.repository.js';
import {RESULT_KIND, Result} from '../../../shared/result/result.js';
import type {Result as ResultType} from '../../../shared/result/result.js';
import type {
  CkvDto,
  KeyValueInfoDto,
  ParamInfoDto,
} from '../query/spf-module-dto.js';
import {ERROR_CODES} from '../../../../shared/errors/error-codes.js';

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
  queryServices: QueryServices,
): Promise<ResultType<KeyValueInfoDto[]>> {
  const result =
    await queryServices.keyValueDefQueryService.getKeyValueSummaryForGivenValues(
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
