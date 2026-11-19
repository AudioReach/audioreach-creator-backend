/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {LegacyIssue} from '../../../shared/issues/index.js';

/**
 * Named constants for Result<T>.kind — compare against these instead of
 * raw string literals ('ok'/'partial'/'fail'), matching the codebase's
 * existing enum-like vocabulary convention (CHANGE_OPERATION, SESSION_STATUS,
 * PORT_IO_TYPE, etc.).
 */
export const RESULT_KIND = {
  Ok: 'OK',
  Partial: 'PARTIAL',
  Fail: 'FAIL',
} as const;
export type ResultKind = (typeof RESULT_KIND)[keyof typeof RESULT_KIND];

/**
 * Outcome envelope for query and command handlers.
 *
 * Three tagged variants:
 *   ok       — data produced; optional non-blocking issues (warnings)
 *   partial  — data produced with per-item or per-field ERROR/FATAL issues
 *   fail     — no data; outcome expressed as structured issues (validation
 *              rejection with fixOptions, request-shape rejection with hints).
 *              Handlers throw a DomainException for unstructured total failures.
 *
 * `I` is the issue type. Routing carries `IssueFact` and renders it to
 * `Issue` before the result leaves the handler; other code uses the default.
 *
 * Design §3.1, FR-2, FR-3, I-1, I-5, I-6.
 */
export type Result<T, I = LegacyIssue> =
  | {
      readonly kind: typeof RESULT_KIND.Ok;
      readonly data: T;
      readonly issues?: readonly I[];
    }
  | {
      readonly kind: typeof RESULT_KIND.Partial;
      readonly data: T;
      readonly issues: readonly I[];
    }
  | {
      readonly kind: typeof RESULT_KIND.Fail;
      readonly issues: readonly I[];
    };

/**
 * Factory namespace for constructing Result<T> values.
 *
 * Runtime invariants (design §3.2, FR-3.2, FR-3.3, I-2, I-3):
 *   - partial() throws if issues is empty (use ok() for issue-free success)
 *   - fail() throws if no issues are supplied
 *   - ok() with an empty issues array returns a variant with no issues field
 *
 * The issue type is inferred from the issues passed; a result with no issues
 * has issue type `never` and fits any `Result<T, I>`.
 *
 * No predicate helpers — the `kind` discriminant is self-documenting (FR-3).
 * Compare against RESULT_KIND's named constants, not raw string literals.
 */
function ok(): Result<void, never>;
function ok<T, I = never>(data: T, issues?: readonly I[]): Result<T, I>;
function ok<T, I>(data?: T, issues?: readonly I[]): Result<T | void, I> {
  if (issues && issues.length > 0) {
    return {kind: RESULT_KIND.Ok, data, issues};
  }
  return {kind: RESULT_KIND.Ok, data};
}

export const Result = {
  ok,

  partial<T, I>(data: T, issues: readonly I[]): Result<T, I> {
    if (issues.length === 0) {
      throw new Error(
        'Result.partial() requires at least one issue — use Result.ok() for issue-free success',
      );
    }
    return {kind: RESULT_KIND.Partial, data, issues};
  },

  fail<T = never, I = LegacyIssue>(...issues: readonly I[]): Result<T, I> {
    if (issues.length === 0) {
      throw new Error('Result.fail() requires at least one issue');
    }
    return {kind: RESULT_KIND.Fail, issues};
  },
} as const;
