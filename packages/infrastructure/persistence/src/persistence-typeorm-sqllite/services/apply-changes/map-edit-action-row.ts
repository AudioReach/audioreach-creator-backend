/*
 * Copyright (c) Qualcomm Technologies, Inc. and/or its subsidiaries.
 * SPDX-License-Identifier: BSD-3-Clause
 */

import {CHANGE_OPERATION, DomainRuleViolationException} from '@arc/core';
import type {EditActionRow} from '../../entity-schema/edit-session/edit-action.schema.js';
import {ApplyIssueFactory} from './apply-issues.js';
import type {PendingApplyAction} from './apply-changes.types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Maps one selected edit_actions row to its one-to-one reduction input. */
export function mapEditActionRow(row: EditActionRow): PendingApplyAction {
  if (row.operation === CHANGE_OPERATION.None) {
    throw new DomainRuleViolationException([
      ApplyIssueFactory.invalidOperation(
        row.targetTable,
        row.aggregateId,
        row.targetSystemId,
        row.operation,
      ),
    ]);
  }
  return {
    aggregateId: row.aggregateId,
    entityName: row.targetTable,
    targetSystemId: row.targetSystemId,
    operation: row.operation,
    fieldPath: row.fieldPath,
    newValue: isRecord(row.newValue) ? row.newValue : {},
  };
}
