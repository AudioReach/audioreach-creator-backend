/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

export const IssueSeverity = {
  Fatal: 'FATAL',
  Error: 'ERROR',
  Warning: 'WARNING',
} as const;
export type IssueSeverity = (typeof IssueSeverity)[keyof typeof IssueSeverity];

export const IssueCategory = {
  Blocking: 'BLOCKING',
  NonBlocking: 'NON_BLOCKING',
  DataLoss: 'DATA_LOSS', // Data was not inserted into DB during upload
} as const;
export type IssueCategory = (typeof IssueCategory)[keyof typeof IssueCategory];

/**
 * Ordered severity levels from least to most severe.
 * Used to validate that severity overrides are strictly escalating.
 */
export const SEVERITY_ORDER: ReadonlyArray<IssueSeverity> = [
  IssueSeverity.Warning,
  IssueSeverity.Error,
  IssueSeverity.Fatal,
] as const;

/**
 * Maps severity to BLOCKING or NON_BLOCKING.
 * DATA_LOSS is set explicitly by the insertion failure code — not derived from severity.
 */
export function deriveCategoryFromSeverity(
  severity: IssueSeverity,
): IssueCategory {
  return severity === IssueSeverity.Fatal || severity === IssueSeverity.Error
    ? IssueCategory.Blocking
    : IssueCategory.NonBlocking;
}
