/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {Result} from '@arc/core';
import {RESULT_KIND} from '@arc/core';
import type {ApiResult} from '../dto/api-response/api-result.dto.js';
import {toApiIssueItems} from '../dto/api-response/api-issue-item.mapper.js';

/**
 * Projects a `Result<T>` to the `ApiResult<T>` wire DTO.
 *
 * Accepts the full `Result<T>` union so controllers stay as thin as possible.
 * An optional `mapper` transforms the domain data to a DTO type before the
 * wire envelope is built — this avoids exposing `result.data` at the call site:
 *
 *   return toApiResult(result);                           // T is already the DTO type
 *   return toApiResult(result, data => mapToDto(data));  // map domain → DTO inline
 *
 * Issues from the original result are propagated to the output in both forms.
 *
 * Handlers must throw a DomainException on failure — never return `Result.fail()`.
 * If a `fail` result reaches this function it is a programming contract violation:
 * an `Error` is thrown, which surfaces as a 500 via AllExceptionsFilter.
 *
 * When `result.issues` is absent or empty, the `issues` field is omitted from
 * the output body (the wire contract disallows empty `issues[]`).
 */
export function toApiResult<T, U = T>(
  result: Result<T>,
  mapper?: (data: T) => U,
): ApiResult<U> {
  if (result.kind === RESULT_KIND.Fail) {
    throw new Error(
      'toApiResult received a fail Result — handler must throw DomainException instead of returning Result.fail().',
    );
  }
  const data =
    mapper == null ? (result.data as unknown as U) : mapper(result.data);
  return {
    data,
    ...(result.issues?.length && {issues: toApiIssueItems(result.issues)}),
  };
}
