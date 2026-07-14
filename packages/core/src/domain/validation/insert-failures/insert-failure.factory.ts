/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import type {ValidationIssue} from '../issue.js';
import type {FixOption} from '../../../shared/issues/index.js';
import {IssueSeverity, IssueCategory} from '../../../shared/issues/index.js';
import {
  INSERT_FAILURE,
  type InsertFailureType,
} from './insert-failure-codes.js';

/**
 * Build a WARNING/DATA_LOSS ValidationIssue from an insert-failure catalog entry.
 *
 * The produced issue is:
 *   - severity=WARNING, defaultSeverity=WARNING (so preference-enforcer treats it uniformly)
 *   - category=DATA_LOSS (drives acknowledgment gate + files.data_loss_issues storage)
 *   - impactedEntity populated from the catalog entry's entityType + caller's systemId
 *   - fixOptions omitted when empty/undefined (structural equivalence with Issue base type)
 *
 * @param type         Symbolic catalog key (grep-able).
 * @param systemId     The failing entity's aggregate systemId (log in hex via BinaryUtils.toHexString elsewhere).
 * @param detail       Raw DB error detail — appended to the catalog's rule name.
 * @param displayName  Optional human-readable identifier (module alias, link name).
 * @param fixOptions   Optional client-actionable fix templates.
 */
export function newInsertFailureIssue(
  type: InsertFailureType,
  systemId: number,
  detail: string,
  displayName?: string,
  fixOptions?: FixOption[],
): ValidationIssue {
  const spec = INSERT_FAILURE[type];
  return {
    code: spec.code,
    name: spec.name,
    message: `${spec.name}: ${detail}`,
    defaultSeverity: IssueSeverity.Fatal,
    severity: IssueSeverity.Fatal,
    category: IssueCategory.DataLoss,
    impactedEntity: {
      entityType: spec.entityType,
      systemId,
      ...(displayName !== undefined && {displayName}),
    },
    impactedUsecases: [],
    ...(fixOptions && fixOptions.length > 0 && {fixOptions}),
  };
}
